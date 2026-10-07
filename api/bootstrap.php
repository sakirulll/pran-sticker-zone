<?php
declare(strict_types=1);

const POS_CONFIG_FILE = '/home/pranmzcs/pos-private-config.php';
const POS_SCHEMA_VERSION = 3;
const APP_NAME = 'HishabPOS';

function respond(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(string $message, int $status = 400): never
{
    respond(['ok' => false, 'error' => $message], $status);
}

// A development machine points this at its own file; the live server uses the default.
function config_file(): string
{
    $override = getenv('POS_CONFIG_FILE');
    return is_string($override) && $override !== '' ? $override : POS_CONFIG_FILE;
}

function config(): array
{
    $file = config_file();
    if (!is_file($file)) {
        fail('The server database configuration is not ready yet.', 503);
    }
    $config = require $file;
    if (!is_array($config) || !isset($config['db_host'], $config['db_name'], $config['db_user'], $config['db_password'])) {
        fail('The server database configuration is invalid.', 503);
    }
    return $config;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    $settings = config();
    try {
        $pdo = new PDO(
            "mysql:host={$settings['db_host']};dbname={$settings['db_name']};charset=utf8mb4",
            $settings['db_user'],
            $settings['db_password'],
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ],
        );
    } catch (PDOException) {
        fail('The server could not connect to its database.', 503);
    }
    ensure_schema($pdo);
    return $pdo;
}

// Creates any missing tables from schema.sql, so a new version only needs deploying.
// Every statement there is "CREATE TABLE IF NOT EXISTS", which makes re-running safe.
function ensure_schema(PDO $pdo): void
{
    try {
        $version = (int)$pdo->query("SELECT value FROM pos_meta WHERE name = 'schema_version'")->fetchColumn();
    } catch (PDOException) {
        $version = 0;
    }
    if ($version >= POS_SCHEMA_VERSION) {
        return;
    }
    $sql = (string)file_get_contents(__DIR__ . '/schema.sql');
    try {
        foreach (explode(';', $sql) as $statement) {
            if (trim($statement) !== '') {
                $pdo->exec($statement);
            }
        }
        $save = $pdo->prepare("REPLACE INTO pos_meta (name, value) VALUES ('schema_version', ?)");
        $save->execute([(string)POS_SCHEMA_VERSION]);
    } catch (PDOException) {
        fail('The database needs an update. Import api/schema.sql in phpMyAdmin, then reload.', 503);
    }
}

function request_data(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }
    if (strlen($raw) > 8 * 1024 * 1024) {
        fail('This request is too large.', 413);
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        fail('Invalid request data.');
    }
    return $data;
}

function value(array $data, string $key): string
{
    return trim((string)($data[$key] ?? ''));
}

function uuid(): string
{
    $bytes = bin2hex(random_bytes(16));
    return substr($bytes, 0, 8) . '-' . substr($bytes, 8, 4) . '-' . substr($bytes, 12, 4) . '-' . substr($bytes, 16, 4) . '-' . substr($bytes, 20);
}

function start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    session_name('pran_pos_session');
    session_set_cookie_params([
        'lifetime' => 60 * 60 * 24 * 14,
        'path' => '/',
        'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

function current_user(): ?array
{
    start_session();
    $userId = $_SESSION['pos_user_id'] ?? '';
    if (!is_string($userId) || $userId === '') {
        return null;
    }
    $query = db()->prepare('SELECT id, email, display_name, created_at FROM pos_users WHERE id = ? LIMIT 1');
    $query->execute([$userId]);
    return $query->fetch() ?: null;
}

function require_user(): array
{
    $user = current_user();
    if (!$user) {
        fail('Please log in first.', 401);
    }
    return $user;
}

function require_same_origin(): void
{
    if (!in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
        return;
    }
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin === '') {
        return;
    }
    $originHost = parse_url($origin, PHP_URL_HOST);
    $host = preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST'] ?? '');
    if (!$originHost || !is_string($host) || strtolower($originHost) !== strtolower($host)) {
        fail('This request came from an unapproved website.', 403);
    }
}

function membership_for(string $userId): ?array
{
    $owner = db()->prepare('SELECT id, owner_user_id FROM pos_shops WHERE owner_user_id = ? LIMIT 1');
    $owner->execute([$userId]);
    $shop = $owner->fetch();
    if ($shop) {
        return ['shop_id' => $shop['id'], 'role_id' => null, 'owner' => true];
    }

    $member = db()->prepare('SELECT shop_id, role_id FROM pos_shop_members WHERE user_id = ? AND active = 1 LIMIT 1');
    $member->execute([$userId]);
    $row = $member->fetch();
    if (!$row) {
        return null;
    }
    return ['shop_id' => $row['shop_id'], 'role_id' => $row['role_id'], 'owner' => false];
}

function app_url(): string
{
    $configured = config()['app_url'] ?? '';
    if (is_string($configured) && $configured !== '') {
        return rtrim($configured, '/');
    }
    $secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    return ($secure ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
}

function send_mail(string $to, string $subject, string $body): bool
{
    $settings = config();
    // A development machine has no mail server, so it writes emails to a file instead.
    if (!empty($settings['mail_log'])) {
        return file_put_contents((string)$settings['mail_log'], "To: {$to}\nSubject: {$subject}\n\n{$body}\n---\n", FILE_APPEND | LOCK_EX) !== false;
    }
    $host = preg_replace('/:\d+$/', '', (string)parse_url(app_url(), PHP_URL_HOST));
    $from = is_string($settings['mail_from'] ?? null) && $settings['mail_from'] !== '' ? $settings['mail_from'] : 'no-reply@' . $host;
    $headers = [
        'From: ' . APP_NAME . ' <' . $from . '>',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
    ];
    return @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $body, implode("\r\n", $headers));
}

// Dates in backups and emails follow the shop's clock, not the server's.
date_default_timezone_set('Asia/Dhaka');
require_same_origin();