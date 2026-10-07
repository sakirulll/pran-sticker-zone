<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

// Shop data is stored one record per row. Every write bumps the shop's revision
// number, and a device asks for "everything after revision N" to catch up, so
// several devices can work at once without overwriting each other.

const META_COLLECTION = '_meta';
const COLLECTION_LIST = '_collections';
const MAX_RECORD_BYTES = 1024 * 1024;
const MAX_CHANGES_PER_REQUEST = 1000;
// Fields that count something. When two devices change one at the same time the
// two changes are added together instead of the later one replacing the earlier.
const COUNTER_FIELDS = ['stock'];

$user = require_user();
$membership = membership_for($user['id']);
if (!$membership) {
    fail('This account is not linked to a shop.', 403);
}
$shopId = (string)$membership['shop_id'];
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

function encode(mixed $value): string
{
    $json = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        fail('Shop data could not be stored.', 500);
    }
    return $json;
}

function valid_name(mixed $name): bool
{
    return is_string($name) && preg_match('/^[A-Za-z_][A-Za-z0-9_]{0,39}$/', $name) === 1;
}

function valid_record_id(mixed $id): bool
{
    return is_string($id) && preg_match('/^[A-Za-z0-9_.:-]{1,40}$/', $id) === 1;
}

function is_number(mixed $value): bool
{
    return is_int($value) || is_float($value);
}

function same(mixed $a, mixed $b): bool
{
    return json_encode($a) === json_encode($b);
}

// A list of records: every entry is an object carrying its own id.
function is_record_list(mixed $value): bool
{
    if (!is_array($value)) {
        return false;
    }
    foreach ($value as $entry) {
        if (!is_object($entry) || !isset($entry->id) || !(is_int($entry->id) || is_string($entry->id))) {
            return false;
        }
    }
    return true;
}

// Combines a device's change with a newer stored version. $base is what the
// device started from, $mine what it wants to save, $theirs what is stored now.
function merge3(mixed $base, mixed $mine, mixed $theirs): mixed
{
    if (is_object($mine) && is_object($theirs)) {
        $start = is_object($base) ? $base : new stdClass();
        $result = clone $theirs;
        foreach (get_object_vars($mine) as $key => $value) {
            $known = property_exists($start, (string)$key);
            if ($known && same($start->$key, $value)) {
                continue;
            }
            $isCounter = in_array((string)$key, COUNTER_FIELDS, true)
                && $known && is_number($start->$key) && is_number($value)
                && property_exists($theirs, (string)$key) && is_number($theirs->$key);
            $result->$key = $isCounter ? $theirs->$key + ($value - $start->$key) : $value;
        }
        foreach (get_object_vars($start) as $key => $unused) {
            if (!property_exists($mine, (string)$key)) {
                unset($result->$key);
            }
        }
        return $result;
    }
    if (is_number($base) && is_number($mine) && is_number($theirs)) {
        return $theirs + ($mine - $base);
    }
    return same($base, $mine) ? $theirs : $mine;
}

function shop_revision(PDO $pdo, string $shopId, bool $lock): int
{
    $create = $pdo->prepare('INSERT IGNORE INTO pos_shop_sync (shop_id, rev) VALUES (?, 0)');
    $create->execute([$shopId]);
    $query = $pdo->prepare('SELECT rev FROM pos_shop_sync WHERE shop_id = ?' . ($lock ? ' FOR UPDATE' : ''));
    $query->execute([$shopId]);
    return (int)$query->fetchColumn();
}

function store_record(PDO $pdo, string $shopId, string $collection, string $id, float $pos, string $payload, bool $deleted, int $rev): void
{
    static $statement = null;
    $statement ??= $pdo->prepare(
        'INSERT INTO pos_records (shop_id, collection, record_id, pos, payload, deleted, rev) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE pos = VALUES(pos), payload = VALUES(payload), deleted = VALUES(deleted), rev = VALUES(rev)'
    );
    $statement->execute([$shopId, $collection, $id, $pos, $payload, $deleted ? 1 : 0, $rev]);
}

// Shops saved by the previous version keep everything in one document. Split it
// into records the first time the shop is opened; the old document is left as it was.
function import_legacy_document(PDO $pdo, string $shopId): void
{
    $query = $pdo->prepare('SELECT payload FROM pos_shop_data WHERE shop_id = ?');
    $query->execute([$shopId]);
    $payload = $query->fetchColumn();
    $data = is_string($payload) ? json_decode($payload) : null;
    if (!is_object($data)) {
        return;
    }
    $collections = [];
    foreach (get_object_vars($data) as $key => $value) {
        if (!valid_name($key) || $key === COLLECTION_LIST) {
            continue;
        }
        if (!is_record_list($value)) {
            store_record($pdo, $shopId, META_COLLECTION, $key, 0, encode($value), false, 1);
            continue;
        }
        $collections[] = $key;
        foreach ($value as $index => $record) {
            if (valid_record_id((string)$record->id)) {
                store_record($pdo, $shopId, $key, (string)$record->id, $index + 1, encode($record), false, 1);
            }
        }
    }
    sort($collections);
    store_record($pdo, $shopId, META_COLLECTION, COLLECTION_LIST, 0, encode($collections), false, 1);
    $update = $pdo->prepare('UPDATE pos_shop_sync SET rev = 1 WHERE shop_id = ?');
    $update->execute([$shopId]);
}

function staff_can_change_settings(PDO $pdo, string $shopId, mixed $roleId): bool
{
    $query = $pdo->prepare("SELECT payload FROM pos_records WHERE shop_id = ? AND collection = 'roles' AND record_id = ? AND deleted = 0");
    $query->execute([$shopId, (string)$roleId]);
    $role = json_decode((string)$query->fetchColumn());
    $permissions = is_object($role) && is_array($role->permissions ?? null) ? $role->permissions : [];
    return in_array('All permissions', $permissions, true) || in_array('Settings', $permissions, true);
}

function record_row(string $collection, string $id, mixed $pos, ?string $payload): string
{
    return '[' . json_encode($collection) . ',' . json_encode($id) . ',' . json_encode((float)$pos) . ',' . ($payload ?? 'null') . ']';
}

function send_json_start(): void
{
    http_response_code(200);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
}

if ($method === 'GET') {
    $pdo = db();
    try {
        $pdo->beginTransaction();
        $rev = shop_revision($pdo, $shopId, true);
        if ($rev === 0) {
            import_legacy_document($pdo, $shopId);
            $rev = shop_revision($pdo, $shopId, false);
        }
        $pdo->commit();

        // Written out row by row so a large shop does not have to fit in memory.
        $pdo->setAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY, false);
        $query = $pdo->prepare('SELECT collection, record_id, pos, payload FROM pos_records WHERE shop_id = ? AND deleted = 0');
        $query->execute([$shopId]);
    } catch (PDOException) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        fail('Could not load the shop data. Try again.', 500);
    }
    send_json_start();
    echo '{"ok":true,"rev":', $rev, ',"membership":', encode(['owner' => $membership['owner'], 'roleId' => $membership['role_id']]), ',"records":[';
    $separator = '';
    while ($row = $query->fetch(PDO::FETCH_NUM)) {
        echo $separator, record_row($row[0], $row[1], $row[2], $row[3]);
        $separator = ',';
    }
    echo ']}';
    exit;
}

if ($method === 'POST' && ($_GET['action'] ?? '') === 'sync') {
    $data = request_data();
    $since = max(0, (int)($data['since'] ?? 0));
    $changes = $data['changes'] ?? [];
    if (!is_array($changes) || count($changes) > MAX_CHANGES_PER_REQUEST) {
        fail('Too many changes in one request.', 413);
    }

    $pdo = db();
    $rows = [];
    try {
        $pdo->beginTransaction();
        // Holding this row makes every writer of the shop take turns.
        $rev = shop_revision($pdo, $shopId, true);
        if ($since > $rev) {
            $pdo->rollBack();
            fail('This device is out of step with the server. Reload to continue.', 409);
        }
        if (!$membership['owner'] && $rev === 0) {
            $pdo->rollBack();
            fail('The shop owner must set up the shop first.', 403);
        }
        $newRev = $changes ? $rev + 1 : $rev;
        $canChangeSettings = $membership['owner'] || staff_can_change_settings($pdo, $shopId, $membership['role_id']);
        $find = $pdo->prepare('SELECT pos, payload, deleted, rev FROM pos_records WHERE shop_id = ? AND collection = ? AND record_id = ?');
        // Records whose stored result differs from what the device sent, so it must be told.
        $returned = [];

        foreach ($changes as $change) {
            $collection = is_array($change) ? ($change['c'] ?? null) : null;
            $id = is_array($change) ? ($change['id'] ?? null) : null;
            if (!valid_name($collection) || !valid_record_id($id)) {
                $pdo->rollBack();
                fail('A change in this request is not valid.');
            }
            $delete = !empty($change['del']);
            $payload = $delete ? 'null' : ($change['data'] ?? null);
            if (!is_string($payload) || strlen($payload) > MAX_RECORD_BYTES) {
                $pdo->rollBack();
                fail('A record is too large to save. Reduce its size and try again.', 413);
            }
            $mine = json_decode($payload);
            if (!$delete && $mine === null && json_last_error() !== JSON_ERROR_NONE) {
                $pdo->rollBack();
                fail('A change in this request is not valid.');
            }
            $pos = (float)($change['pos'] ?? 0);
            $find->execute([$shopId, $collection, $id]);
            $stored = $find->fetch();
            $key = $collection . "\n" . $id;

            // Staff can never change roles, and need the Settings permission for shop details.
            $allowed = $membership['owner']
                || ($collection !== 'roles'
                    && ($collection !== META_COLLECTION || !in_array($id, ['user', 'settings'], true) || $canChangeSettings));
            if (!$allowed) {
                $returned[$key] = true;
                continue;
            }
            if ($delete) {
                if ($stored && !$stored['deleted']) {
                    store_record($pdo, $shopId, $collection, $id, (float)$stored['pos'], 'null', true, $newRev);
                }
                continue;
            }
            if ($stored && (int)$stored['rev'] > $since) {
                // Someone else changed this record after the device last saw it.
                $returned[$key] = true;
                if ($stored['deleted']) {
                    continue;
                }
                $theirs = json_decode((string)$stored['payload']);
                if ($collection === META_COLLECTION && $id === COLLECTION_LIST) {
                    $merged = array_values(array_unique(array_merge(is_array($theirs) ? $theirs : [], is_array($mine) ? $mine : [])));
                    sort($merged);
                } else {
                    $base = isset($change['prev']) && is_string($change['prev']) ? json_decode($change['prev']) : null;
                    $merged = merge3($base, $mine, $theirs);
                }
                store_record($pdo, $shopId, $collection, $id, (float)$stored['pos'], encode($merged), false, $newRev);
                continue;
            }
            store_record($pdo, $shopId, $collection, $id, $pos, $payload, false, $newRev);
        }

        if ($newRev !== $rev) {
            $update = $pdo->prepare('UPDATE pos_shop_sync SET rev = ? WHERE shop_id = ?');
            $update->execute([$newRev, $shopId]);
        }

        // What other devices saved since this one last asked.
        $others = $pdo->prepare('SELECT collection, record_id, pos, payload, deleted FROM pos_records WHERE shop_id = ? AND rev > ? AND rev < ?');
        $others->execute([$shopId, $since, $changes ? $newRev : $newRev + 1]);
        foreach ($others->fetchAll() as $row) {
            $rows[$row['collection'] . "\n" . $row['record_id']] = record_row($row['collection'], $row['record_id'], $row['pos'], $row['deleted'] ? null : $row['payload']);
        }
        foreach (array_keys($returned) as $key) {
            [$collection, $id] = explode("\n", (string)$key, 2);
            $find->execute([$shopId, $collection, $id]);
            $row = $find->fetch();
            $rows[$key] = record_row($collection, $id, $row ? $row['pos'] : 0, $row && !$row['deleted'] ? $row['payload'] : null);
        }
        $pdo->commit();
    } catch (PDOException) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        fail('Could not save the shop data. Try again.', 500);
    }
    send_json_start();
    echo '{"ok":true,"rev":', $newRev, ',"remote":[', implode(',', $rows), ']}';
    exit;
}

fail('Unknown request.', 404);
