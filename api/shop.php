<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

$user = require_user();
$membership = membership_for($user['id']);
if (!$membership) {
    fail('This account is not linked to a shop.', 403);
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $query = db()->prepare('SELECT payload, updated_at FROM pos_shop_data WHERE shop_id = ? LIMIT 1');
    $query->execute([$membership['shop_id']]);
    $record = $query->fetch();
    $payload = null;
    if ($record) {
        $payload = json_decode($record['payload'], true);
        if (!is_array($payload)) {
            fail('The stored shop data is invalid.', 500);
        }
    }
    respond([
        'ok' => true,
        'data' => $payload,
        'membership' => ['owner' => $membership['owner'], 'roleId' => $membership['role_id']],
        'updatedAt' => $record['updated_at'] ?? null,
        'revision' => $record ? md5($record['payload']) : null,
    ]);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'PUT') {
    $data = request_data();
    if (!isset($data['data']) || !is_array($data['data'])) {
        fail('Shop data is missing.');
    }
    $next = $data['data'];
    $baseRevision = is_string($data['baseRevision'] ?? null) ? $data['baseRevision'] : '';

    $pdo = db();
    try {
        $pdo->beginTransaction();
        $current = $pdo->prepare('SELECT payload FROM pos_shop_data WHERE shop_id = ? FOR UPDATE');
        $current->execute([$membership['shop_id']]);
        $record = $current->fetch();

        // Another device saved since this one last loaded: refuse instead of overwriting its work.
        $currentRevision = $record ? md5($record['payload']) : '';
        if ($baseRevision !== $currentRevision) {
            $pdo->rollBack();
            fail('The shop data was changed on another device. Reload to continue.', 409);
        }

        if (!$membership['owner']) {
            $stored = $record ? json_decode($record['payload'], true) : null;
            if (!is_array($stored)) {
                $pdo->rollBack();
                fail('The shop owner must set up the shop first.', 403);
            }
            // Staff can never change roles, and need the Settings permission to change shop details.
            $permissions = [];
            foreach (($stored['roles'] ?? []) as $role) {
                if (is_array($role) && (string)($role['id'] ?? '') === (string)$membership['role_id']) {
                    $permissions = is_array($role['permissions'] ?? null) ? $role['permissions'] : [];
                    break;
                }
            }
            $canChangeSettings = in_array('All permissions', $permissions, true) || in_array('Settings', $permissions, true);
            $protected = $canChangeSettings ? ['roles'] : ['roles', 'user', 'settings'];
            foreach ($protected as $key) {
                if (array_key_exists($key, $stored)) {
                    $next[$key] = $stored[$key];
                } else {
                    unset($next[$key]);
                }
            }
        }

        $payload = json_encode($next, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($payload === false || strlen($payload) > 7 * 1024 * 1024) {
            $pdo->rollBack();
            fail('Shop data is too large. Reduce image sizes and try again.', 413);
        }
        $query = $pdo->prepare(
            'INSERT INTO pos_shop_data (shop_id, payload) VALUES (?, ?) ON DUPLICATE KEY UPDATE payload = VALUES(payload), updated_at = CURRENT_TIMESTAMP'
        );
        $query->execute([$membership['shop_id'], $payload]);
        $pdo->commit();
    } catch (PDOException) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        fail('Could not save the shop data. Try again.', 500);
    }
    respond(['ok' => true, 'revision' => md5($payload)]);
}

fail('Unknown request.', 404);
