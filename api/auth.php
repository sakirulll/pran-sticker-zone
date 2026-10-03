<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

$action = (string)($_GET['action'] ?? '');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($action === 'session' && $method === 'GET') {
    $user = current_user();
    respond(['ok' => true, 'user' => $user]);
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
    $query = db()->prepare('SELECT id, password_hash FROM pos_users WHERE email = ? LIMIT 1');
    $query->execute([$email]);
    $account = $query->fetch();
    if (!$account || !password_verify($password, $account['password_hash'])) {
        fail('Email or password is incorrect.', 401);
    }
    start_session();
    session_regenerate_id(true);
    $_SESSION['pos_user_id'] = $account['id'];
    respond(['ok' => true, 'user' => current_user()]);
}

if ($action === 'logout' && $method === 'POST') {
    start_session();
    $_SESSION = [];
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
    $accountQuery = db()->prepare('SELECT password_hash FROM pos_users WHERE id = ?');
    $accountQuery->execute([$user['id']]);
    $account = $accountQuery->fetch();
    if (!$account || !password_verify($currentPassword, $account['password_hash'])) {
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
