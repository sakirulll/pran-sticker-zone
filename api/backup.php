<?php
declare(strict_types=1);

// Daily copies of each shop's records, kept outside the public website folder.
// A copy is taken the first time a shop is opened each day, so no scheduled job
// has to be set up. This file only defines functions; shop.php calls them.

const BACKUP_DAILY_COPIES = 30;
const BACKUP_SAFETY_COPIES = 5;
const BACKUP_NAME = '/^(\d{4}-\d{2}-\d{2}|before-restore-\d{8}-\d{6})\.json\.gz$/';

function backup_dir(string $shopId): string
{
    $base = config()['backup_dir'] ?? '';
    if (!is_string($base) || $base === '') {
        $base = dirname(config_file()) . '/pos-backups';
    }
    $directory = rtrim($base, '/\\') . '/' . $shopId;
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
        throw new RuntimeException('The backup folder could not be created.');
    }
    return $directory;
}

function backup_path(string $shopId, string $name): string
{
    if (preg_match(BACKUP_NAME, $name) !== 1) {
        throw new RuntimeException('That backup does not exist.');
    }
    return backup_dir($shopId) . '/' . $name;
}

// Writes the shop's current records to a compressed file and returns its name.
function backup_shop(PDO $pdo, string $shopId, string $name): string
{
    $path = backup_path($shopId, $name);
    $temporary = $path . '.' . bin2hex(random_bytes(4)) . '.tmp';
    $file = gzopen($temporary, 'wb6');
    if ($file === false) {
        throw new RuntimeException('The backup file could not be written.');
    }
    $revision = $pdo->prepare('SELECT rev FROM pos_shop_sync WHERE shop_id = ?');
    $revision->execute([$shopId]);
    gzwrite($file, '{"shop":' . json_encode($shopId) . ',"createdAt":' . json_encode(date('c')) . ',"rev":' . (int)$revision->fetchColumn() . ',"records":[');

    // Read row by row so a large shop does not have to fit in memory.
    $pdo->setAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY, false);
    try {
        $rows = $pdo->prepare('SELECT collection, record_id, pos, payload FROM pos_records WHERE shop_id = ? AND deleted = 0');
        $rows->execute([$shopId]);
        $separator = '';
        while ($row = $rows->fetch(PDO::FETCH_NUM)) {
            gzwrite($file, $separator . '[' . json_encode($row[0]) . ',' . json_encode($row[1]) . ',' . json_encode((float)$row[2]) . ',' . $row[3] . ']');
            $separator = ',';
        }
        $rows->closeCursor();
    } finally {
        $pdo->setAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY, true);
    }
    gzwrite($file, ']}');
    gzclose($file);
    if (!rename($temporary, $path)) {
        @unlink($temporary);
        throw new RuntimeException('The backup file could not be saved.');
    }
    return $name;
}

function list_backups(string $shopId): array
{
    $backups = [];
    foreach (scandir(backup_dir($shopId)) ?: [] as $name) {
        if (preg_match(BACKUP_NAME, $name) === 1) {
            $path = backup_dir($shopId) . '/' . $name;
            $backups[] = ['name' => $name, 'size' => (int)filesize($path), 'createdAt' => date('c', (int)filemtime($path))];
        }
    }
    usort($backups, fn (array $a, array $b): int => strcmp($b['createdAt'], $a['createdAt']));
    return $backups;
}

// Takes today's copy if there is none yet, and drops copies past the limits.
function backup_if_due(PDO $pdo, string $shopId): void
{
    try {
        $today = date('Y-m-d') . '.json.gz';
        if (is_file(backup_path($shopId, $today))) {
            return;
        }
        backup_shop($pdo, $shopId, $today);
        $kept = ['daily' => 0, 'safety' => 0];
        foreach (list_backups($shopId) as $backup) {
            $kind = str_starts_with($backup['name'], 'before-restore-') ? 'safety' : 'daily';
            if (++$kept[$kind] > ($kind === 'daily' ? BACKUP_DAILY_COPIES : BACKUP_SAFETY_COPIES)) {
                @unlink(backup_path($shopId, $backup['name']));
            }
        }
    } catch (Throwable) {
        // A failed backup must never stop the shop from opening.
    }
}

// Puts the shop back to how it was in a backup. Devices that are open pick the
// change up through the normal sync, as they would any other change.
function restore_shop(PDO $pdo, string $shopId, string $name): void
{
    $path = backup_path($shopId, $name);
    $json = is_file($path) ? gzdecode((string)file_get_contents($path)) : false;
    $backup = is_string($json) ? json_decode($json) : null;
    if (!is_object($backup) || !is_array($backup->records ?? null)) {
        throw new RuntimeException('That backup could not be read.');
    }
    backup_shop($pdo, $shopId, 'before-restore-' . date('Ymd-His') . '.json.gz');

    $pdo->beginTransaction();
    try {
        $create = $pdo->prepare('INSERT IGNORE INTO pos_shop_sync (shop_id, rev) VALUES (?, 0)');
        $create->execute([$shopId]);
        $current = $pdo->prepare('SELECT rev FROM pos_shop_sync WHERE shop_id = ? FOR UPDATE');
        $current->execute([$shopId]);
        $rev = (int)$current->fetchColumn() + 1;

        $clear = $pdo->prepare("UPDATE pos_records SET deleted = 1, payload = 'null', rev = ? WHERE shop_id = ? AND deleted = 0");
        $clear->execute([$rev, $shopId]);
        $store = $pdo->prepare(
            'INSERT INTO pos_records (shop_id, collection, record_id, pos, payload, deleted, rev) VALUES (?, ?, ?, ?, ?, 0, ?)
             ON DUPLICATE KEY UPDATE pos = VALUES(pos), payload = VALUES(payload), deleted = 0, rev = VALUES(rev)'
        );
        foreach ($backup->records as $record) {
            if (is_array($record) && count($record) === 4 && is_string($record[0]) && is_string($record[1])) {
                $store->execute([$shopId, $record[0], $record[1], (float)$record[2], json_encode($record[3], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $rev]);
            }
        }
        $update = $pdo->prepare('UPDATE pos_shop_sync SET rev = ? WHERE shop_id = ?');
        $update->execute([$rev, $shopId]);
        $pdo->commit();
    } catch (Throwable $error) {
        $pdo->rollBack();
        throw $error;
    }
}
