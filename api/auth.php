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

const RESET_LINK_MINUTES = 60;
const RESET_REQUESTS_PER_HOUR = 3;

if ($action === 'request-reset' && $method === 'POST') {
    $data = request_data();
    $email = strtolower(value($data, 'email'));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        fail('Enter a valid email address.');
    }
    $pdo = db();
    $query = $pdo->prepare('SELECT id, display_name FROM pos_users WHERE email = ? LIMIT 1');
    $query->execute([$email]);
    $account = $query->fetch();
    if ($account) {
        $recent = $pdo->prepare('SELECT COUNT(*) FROM pos_password_resets WHERE user_id = ? AND created_at > (NOW() - INTERVAL 1 HOUR)');
        $recent->execute([$account['id']]);
        if ((int)$recent->fetchColumn() < RESET_REQUESTS_PER_HOUR) {
            // Only a hash is stored, so a copy of the database cannot be used to reset passwords.
            $token = bin2hex(random_bytes(32));
            $minutes = RESET_LINK_MINUTES;
            $store = $pdo->prepare("INSERT INTO pos_password_resets (token_hash, user_id, expires_at) VALUES (?, ?, NOW() + INTERVAL {$minutes} MINUTE)");
            $store->execute([hash('sha256', $token), $account['id']]);
            $link = app_url() . '/?reset=' . $token;
            send_mail(
                $email,
                'Password reset - PRAN Sticker Zone POS',
                "Hello {$account['display_name']},\n\n"
                . "Open this link to choose a new password. It works once and expires in {$minutes} minutes.\n\n{$link}\n\n"
                . "নতুন password বেছে নিতে উপরের link টি খুলুন। এটি একবারই কাজ করবে এবং {$minutes} মিনিট পর বাতিল হয়ে যাবে।\n\n"
                . "If you did not ask for this, ignore this email; your password stays the same.\n"
            );
        }
    }
    // The same answer whether or not the account exists, so this cannot be used to find out who has one.
    respond(['ok' => true]);
}

if ($action === 'reset' && $method === 'POST') {
    $data = request_data();
    $token = value($data, 'token');
    $password = (string)($data['password'] ?? '');
    if (strlen($password) < 8) {
        fail('The new password must have at least 8 characters.');
    }
    $pdo = db();
    try {
        $pdo->beginTransaction();
        $query = $pdo->prepare(
            'SELECT r.user_id, u.email FROM pos_password_resets r JOIN pos_users u ON u.id = r.user_id
             WHERE r.token_hash = ? AND r.used_at IS NULL AND r.expires_at > NOW() FOR UPDATE'
        );
        $query->execute([hash('sha256', $token)]);
        $reset = $query->fetch();
        if (!$reset) {
            $pdo->rollBack();
            fail('This reset link is not valid any more. Ask for a new one.', 410);
        }
        $update = $pdo->prepare('UPDATE pos_users SET password_hash = ? WHERE id = ?');
        $update->execute([password_hash($password, PASSWORD_DEFAULT), $reset['user_id']]);
        // Every outstanding link for the account stops working, not just this one.
        $used = $pdo->prepare('UPDATE pos_password_resets SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL');
        $used->execute([$reset['user_id']]);
        $pdo->commit();
    } catch (PDOException) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        fail('Could not reset the password. Try again.', 500);
    }
    clear_failed_logins((string)$reset['email']);
    respond(['ok' => true]);
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
