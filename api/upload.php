<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    fail('Use POST for image uploads.', 405);
}

$user = require_user();
$membership = membership_for($user['id']);
if (!$membership) {
    fail('This account is not linked to a shop.', 403);
}

$data = request_data();

if (($_GET['action'] ?? '') === 'delete') {
    // Only files this shop uploaded, named the way this script names them.
    $pattern = '#^/uploads/([0-9a-f-]{36})/([0-9a-f-]{36}\.(?:jpg|png|webp))$#';
    if (!preg_match($pattern, value($data, 'url'), $parts) || $parts[1] !== $membership['shop_id']) {
        fail('This image cannot be deleted.', 403);
    }
    $file = dirname(__DIR__) . '/uploads/' . $parts[1] . '/' . $parts[2];
    if (is_file($file)) {
        @unlink($file);
    }
    respond(['ok' => true]);
}

$image = (string)($data['image'] ?? '');
if (!preg_match('#^data:image/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\r\n]+)$#i', $image, $matches)) {
    fail('Choose a PNG, JPEG, or WebP image.');
}

$binary = base64_decode($matches[2], true);
if ($binary === false || strlen($binary) === 0 || strlen($binary) > 2 * 1024 * 1024) {
    fail('The image must be smaller than 2 MB.', 413);
}

$info = @getimagesizefromstring($binary);
$mime = is_array($info) ? ($info['mime'] ?? '') : '';
$extensions = [
    'image/jpeg' => 'jpg',
    'image/png' => 'png',
    'image/webp' => 'webp',
];
if (!isset($extensions[$mime])) {
    fail('The image file is not valid.');
}

$directory = dirname(__DIR__) . '/uploads/' . $membership['shop_id'];
if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) {
    fail('The server could not prepare image storage.', 500);
}

$filename = uuid() . '.' . $extensions[$mime];
$target = $directory . '/' . $filename;
if (file_put_contents($target, $binary, LOCK_EX) === false) {
    fail('The server could not save this image.', 500);
}

respond(['ok' => true, 'url' => '/uploads/' . rawurlencode($membership['shop_id']) . '/' . rawurlencode($filename)]);
