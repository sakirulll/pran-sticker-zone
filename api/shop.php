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
    ]);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'PUT') {
    $data = request_data();
    if (!isset($data['data']) || !is_array($data['data'])) {
        fail('Shop data is missing.');
    }
    $payload = json_encode($data['data'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($payload === false || strlen($payload) > 7 * 1024 * 1024) {
        fail('Shop data is too large. Reduce image sizes and try again.', 413);
    }
    $query = db()->prepare(
        'INSERT INTO pos_shop_data (shop_id, payload) VALUES (?, ?) ON DUPLICATE KEY UPDATE payload = VALUES(payload), updated_at = CURRENT_TIMESTAMP'
    );
    $query->execute([$membership['shop_id'], $payload]);
    respond(['ok' => true]);
}

fail('Unknown request.', 404);
