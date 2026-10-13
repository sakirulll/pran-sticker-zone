<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/subscription.php';
require __DIR__ . '/drivebackup.php';

// The platform admin's Drive Backup page: connecting a Google account, seeing
// what is on Drive, and taking a copy now. Only the admin may use any of it.

$user = require_user();
$pdo = db();
if (!is_admin($pdo, $user)) {
    fail('Only the platform admin can manage the Drive backup.', 403);
}
$action = (string)($_GET['action'] ?? '');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

function back_to_page(string $note = ''): never
{
    header('Location: ' . app_url() . '/' . ($note === '' ? '' : '?drive=' . rawurlencode($note)) . '#admin-drive');
    exit;
}

// Google sends the admin back here, with no action named, after they answer its question.
if ($method === 'GET' && $action === '' && (isset($_GET['code']) || isset($_GET['error']))) {
    $expected = $_SESSION['drive_state'] ?? '';
    unset($_SESSION['drive_state']);
    if (!is_string($expected) || $expected === '' || !hash_equals($expected, (string)($_GET['state'] ?? ''))) {
        back_to_page('expired');
    }
    if (!isset($_GET['code'])) {
        back_to_page('refused');
    }
    try {
        [$status, , $content] = drive_http('POST', google_url('token'), ['Content-Type: application/x-www-form-urlencoded'], http_build_query([
            'code' => (string)$_GET['code'],
            'client_id' => drive_meta($pdo, 'client_id'),
            'client_secret' => drive_meta($pdo, 'client_secret'),
            'redirect_uri' => drive_redirect_uri(),
            'grant_type' => 'authorization_code',
        ]));
    } catch (Throwable) {
        back_to_page('unreachable');
    }
    $answer = json_decode($content, true);
    if ($status !== 200 || !is_array($answer) || empty($answer['refresh_token'])) {
        back_to_page('failed');
    }
    drive_meta_set($pdo, 'refresh_token', (string)$answer['refresh_token']);
    // So today's copy is taken straight away rather than tomorrow.
    drive_meta_set($pdo, 'attempt_day', '');
    back_to_page('connected');
}

if ($action === 'connect' && $method === 'GET') {
    if (drive_meta($pdo, 'client_id') === '' || drive_meta($pdo, 'client_secret') === '') {
        back_to_page('setup');
    }
    $_SESSION['drive_state'] = bin2hex(random_bytes(16));
    header('Location: ' . google_url('auth') . '?' . http_build_query([
        'client_id' => drive_meta($pdo, 'client_id'),
        'redirect_uri' => drive_redirect_uri(),
        'response_type' => 'code',
        'scope' => DRIVE_SCOPE,
        // "offline" and "consent" together make Google hand over a lasting permission.
        'access_type' => 'offline',
        'prompt' => 'consent',
        'state' => $_SESSION['drive_state'],
    ]));
    exit;
}

if ($action === 'status' && $method === 'GET') {
    $connected = drive_meta($pdo, 'refresh_token') !== '';
    $files = [];
    $problem = '';
    if ($connected) {
        try {
            $token = drive_access_token($pdo);
            foreach (drive_files($token, drive_folder($pdo, $token)) as $file) {
                $files[] = ['name' => $file['name'], 'size' => $file['size'], 'createdTime' => $file['createdTime']];
            }
        } catch (Throwable $error) {
            $problem = clip($error->getMessage(), 240);
        }
    }
    respond([
        'ok' => true,
        'clientId' => drive_meta($pdo, 'client_id'),
        'hasSecret' => drive_meta($pdo, 'client_secret') !== '',
        'redirectUri' => drive_redirect_uri(),
        'connected' => $connected,
        'keepDays' => DRIVE_KEEP_DAYS,
        'lastRun' => drive_meta($pdo, 'last_run'),
        'lastOk' => drive_meta($pdo, 'last_ok') === '1',
        'lastResult' => drive_meta($pdo, 'last_result'),
        'problem' => $problem,
        'files' => $files,
    ]);
}

if ($method === 'POST') {
    $data = request_data();
    if ($action === 'settings') {
        $clientId = value($data, 'clientId');
        $secret = value($data, 'clientSecret');
        if ($clientId === '' || ($secret === '' && drive_meta($pdo, 'client_secret') === '')) {
            fail('Enter both the Client ID and the Client secret.');
        }
        // A different Google project cannot use the old permission.
        if ($clientId !== drive_meta($pdo, 'client_id') || $secret !== '') {
            drive_meta_set($pdo, 'refresh_token', '');
        }
        drive_meta_set($pdo, 'client_id', $clientId);
        if ($secret !== '') {
            drive_meta_set($pdo, 'client_secret', $secret);
        }
        respond(['ok' => true]);
    }
    if ($action === 'disconnect') {
        drive_meta_set($pdo, 'refresh_token', '');
        respond(['ok' => true]);
    }
    if ($action === 'run') {
        if (drive_meta($pdo, 'refresh_token') === '') {
            fail('Connect Google Drive first.');
        }
        drive_meta_set($pdo, 'attempt_day', date('Y-m-d'));
        $result = drive_backup_run($pdo, true);
        respond(['ok' => true, 'result' => $result]);
    }
}

fail('Unknown Drive backup request.', 404);
