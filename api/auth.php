<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

$action = (string)($_GET['action'] ?? '');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($action === 'session' && $method === 'GET') {
    $user = current_user();
    respond(['ok' => true, 'user' => $user]);
}

const LOGIN_ATTEMPT_LIMIT = 8;
const LOGIN_ATTEMPT_WINDOW_MINUTES = 15;

// Counts recent failed logins for this email or address. Any database problem
// here must never block a real login, so failures simply skip the limit.
function too_many_login_attempts(string $email, string $ip): bool
{
    try {
        db()->exec(
            'CREATE TABLE IF NOT EXISTS pos_login_attempts (
              id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
              email VARCHAR(254) NOT NULL,
              ip VARCHAR(45) NOT NULL,
              attempted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (id),
              KEY pos_login_attempts_email (email, attempted_at),
              KEY pos_login_attempts_ip (ip, attempted_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );
        $minutes = LOGIN_ATTEMPT_WINDOW_MINUTES;
        db()->exec('DELETE FROM pos_login_attempts WHERE attempted_at < (NOW() - INTERVAL 1 DAY)');
        $query = db()->prepare(
            "SELECT COUNT(*) AS total FROM pos_login_attempts WHERE (email = ? OR ip = ?) AND attempted_at > (NOW() - INTERVAL {$minutes} MINUTE)"
        );
        $query->execute([$email, $ip]);
        return (int)($query->fetch()['total'] ?? 0) >= LOGIN_ATTEMPT_LIMIT;
    } catch (PDOException) {
        return false;
    }
}

function record_failed_login(string $email, string $ip): void
{
    try {
        $query = db()->prepare('INSERT INTO pos_login_attempts (email, ip) VALUES (?, ?)');
        $query->execute([substr($email, 0, 254), $ip]);
    } catch (PDOException) {
    }
}

function clear_failed_logins(string $email): void
{
    try {
        $query = db()->prepare('DELETE FROM pos_login_attempts WHERE email = ?');
        $query->execute([$email]);
    } catch (PDOException) {
    }
}

if ($action === 'register' && $method === 'POST') {
    $data = request_data();
    $name = value($data, 'name');
    $email = strtolower(value($data, 'email'));
    $password = (string)($data['password'] ?? '');
    if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 8) {
        fail('Enter a name, valid email, and password with at least 8 characters.');
    }
    $pdo = db();
    try {
        $pdo->beginTransaction();
        $userId = uuid();
        $shopId = uuid();
        $user = $pdo->prepare('INSERT INTO pos_users (id, email, display_name, password_hash) VALUES (?, ?, ?, ?)');
        $user->execute([$userId, $email, $name, password_hash($password, PASSWORD_DEFAULT)]);
        $shop = $pdo->prepare('INSERT INTO pos_shops (id, owner_user_id, name) VALUES (?, ?, ?)');
        $shop->execute([$shopId, $userId, $name . "'s shop"]);
        $pdo->commit();
    } catch (PDOException $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        if ((string)$error->getCode() === '23000') {
            fail('An account already exists for this email.', 409);
        }
        fail('Could not create the account.', 500);
    }
    start_session();
    session_regenerate_id(true);
    $_SESSION['pos_user_id'] = $userId;
    respond(['ok' => true, 'user' => current_user()], 201);
}

if ($action === 'login' && $method === 'POST') {
    $data = request_data();
    $email = strtolower(value($data, 'email'));
    $password = (string)($data['password'] ?? '');
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? '');
    if (too_many_login_attempts($email, $ip)) {
        fail('Too many failed attempts. Wait 15 minutes and try again.', 429);
    }
    $query = db()->prepare('SELECT id, password_hash FROM pos_users WHERE email = ? LIMIT 1');
    $query->execute([$email]);
    $account = $query->fetch();
    if (!$account || !password_verify($password, $account['password_hash'])) {
        record_failed_login($email, $ip);
        fail('Email or password is incorrect.', 401);
    }
    clear_failed_logins($email);
    start_session();
    session_regenerate_id(true);
    $_SESSION['pos_user_id'] = $account['id'];
    respond(['ok' => true, 'user' => current_user()]);
}

if ($action === 'logout' && $method === 'POST') {
    start_session();
    $_SESSION = [];
    $cookie = session_get_cookie_params();
    setcookie(session_name(), '', [
        'expires' => time() - 3600,
        'path' => $cookie['path'],
        'secure' => $cookie['secure'],
        'httponly' => $cookie['httponly'],
        'samesite' => $cookie['samesite'],
    ]);
    session_destroy();
    respond(['ok' => true]);
}

if ($action === 'create-member' && $method === 'POST') {
    $owner = require_user();
    $membership = membership_for($owner['id']);
    if (!$membership || !$membership['owner']) {
        fail('Only the shop owner can create staff accounts.', 403);
    }
    $data = request_data();
    $name = value($data, 'name');
    $email = strtolower(value($data, 'email'));
    $password = (string)($data['password'] ?? '');
    $roleId = (int)($data['roleId'] ?? 0);
    if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 8 || $roleId < 1) {
        fail('Enter valid staff account details.');
    }
    $pdo = db();
    try {
        $pdo->beginTransaction();
        $userId = uuid();
        $user = $pdo->prepare('INSERT INTO pos_users (id, email, display_name, password_hash) VALUES (?, ?, ?, ?)');
        $user->execute([$userId, $email, $name, password_hash($password, PASSWORD_DEFAULT)]);
        $member = $pdo->prepare('INSERT INTO pos_shop_members (shop_id, user_id, role_id, active) VALUES (?, ?, ?, 1)');
        $member->execute([$membership['shop_id'], $userId, $roleId]);
        $pdo->commit();
    } catch (PDOException $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        if ((string)$error->getCode() === '23000') {
            fail('An account already exists for this email.', 409);
        }
        fail('Could not create the staff account.', 500);
    }
    respond(['ok' => true]);
}

if ($action === 'profile' && $method === 'POST') {
    $user = require_user();
    $data = request_data();
    $name = value($data, 'name');
    $email = strtolower(value($data, 'email'));
    $currentPassword = (string)($data['currentPassword'] ?? '');
    $newPassword = (string)($data['newPassword'] ?? '');
    if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        fail('Enter a valid name and email.');
    }
    $accountQuery = db()->prepare('SELECT email, password_hash FROM pos_users WHERE id = ?');
    $accountQuery->execute([$user['id']]);
    $account = $accountQuery->fetch();
    if (!$account) {
        fail('Your account could not be found.', 401);
    }
    $needsPasswordCheck = $email !== strtolower((string)$account['email']) || $newPassword !== '';
    if ($needsPasswordCheck && !password_verify($currentPassword, $account['password_hash'])) {
        fail('Your current password is incorrect.', 401);
    }
    if ($newPassword !== '' && strlen($newPassword) < 8) {
        fail('The new password must have at least 8 characters.');
    }
    try {
        $query = db()->prepare('UPDATE pos_users SET email = ?, display_name = ?, password_hash = COALESCE(?, password_hash) WHERE id = ?');
        $query->execute([$email, $name, $newPassword === '' ? null : password_hash($newPassword, PASSWORD_DEFAULT), $user['id']]);
    } catch (PDOException $error) {
        if ((string)$error->getCode() === '23000') {
            fail('This email is already used by another account.', 409);
        }
        fail('Could not update the profile.', 500);
    }
    respond(['ok' => true, 'user' => current_user()]);
}

fail('Unknown request.', 404);
