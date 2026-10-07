<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/subscription.php';

// Subscriptions: a shop owner reports a payment made by mobile banking, and the
// platform admin checks it and approves it, which extends the shop's paid period.

$user = require_user();
$pdo = db();
$action = (string)($_GET['action'] ?? '');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$admin = is_admin($pdo, $user);

function public_settings(array $settings): array
{
    return [
        'priceMonthly' => (float)$settings['price_monthly'],
        'priceYearly' => (float)$settings['price_yearly'],
        'trialDays' => (int)$settings['trial_days'],
        'bkashNumber' => $settings['bkash_number'],
        'nagadNumber' => $settings['nagad_number'],
        'supportPhone' => $settings['support_phone'],
        'verifyGraceDays' => (int)$settings['verify_grace_days'],
    ];
}

function payment_row(array $row): array
{
    return [
        'id' => (int)$row['id'],
        'plan' => $row['plan'],
        'amount' => (float)$row['amount'],
        'method' => $row['method'],
        'sender' => $row['sender'],
        'trxId' => $row['trx_id'],
        'status' => $row['status'],
        'note' => $row['note'],
        'createdAt' => $row['created_at'],
        'shopName' => $row['shop_name'] ?? null,
        'ownerEmail' => $row['owner_email'] ?? null,
    ];
}

if ($action === 'status' && $method === 'GET') {
    $membership = membership_for($user['id']);
    if (!$membership) {
        fail('This account is not linked to a shop.', 403);
    }
    $payments = [];
    if ($membership['owner']) {
        $query = $pdo->prepare('SELECT * FROM pos_payments WHERE shop_id = ? ORDER BY id DESC LIMIT 20');
        $query->execute([$membership['shop_id']]);
        $payments = array_map('payment_row', $query->fetchAll());
    }
    respond([
        'ok' => true,
        'subscription' => shop_subscription($pdo, (string)$membership['shop_id']),
        'settings' => public_settings(billing_settings($pdo)),
        'payments' => $payments,
        'owner' => $membership['owner'],
    ]);
}

if ($action === 'submit' && $method === 'POST') {
    $membership = membership_for($user['id']);
    if (!$membership || !$membership['owner']) {
        fail('Only the shop owner can pay for the subscription.', 403);
    }
    $data = request_data();
    $plan = value($data, 'plan');
    $payMethod = strtolower(value($data, 'method'));
    $sender = preg_replace('/[^0-9+]/', '', value($data, 'sender'));
    $trxId = strtoupper(preg_replace('/\s+/', '', value($data, 'trxId')));
    if (!isset(BILLING_PLANS[$plan]) || !in_array($payMethod, ['bkash', 'nagad'], true)) {
        fail('Choose a plan and a payment method.');
    }
    if (strlen((string)$sender) < 11 || strlen((string)$sender) > 15) {
        fail('Enter the mobile number the money was sent from.');
    }
    if (preg_match('/^[A-Z0-9]{6,30}$/', (string)$trxId) !== 1) {
        fail('Enter the Transaction ID from the payment message.');
    }
    $settings = billing_settings($pdo);
    try {
        $store = $pdo->prepare('INSERT INTO pos_payments (shop_id, plan, amount, method, sender, trx_id) VALUES (?, ?, ?, ?, ?, ?)');
        $store->execute([$membership['shop_id'], $plan, $settings['price_' . $plan], $payMethod, $sender, $trxId]);
    } catch (PDOException $error) {
        if ((string)$error->getCode() === '23000') {
            fail('This Transaction ID has already been submitted.', 409);
        }
        fail('The payment could not be recorded. Try again.', 500);
    }
    respond(['ok' => true], 201);
}

// Everything below is for the platform admin.
if (!str_starts_with($action, 'admin-')) {
    fail('Unknown request.', 404);
}
if (!$admin) {
    fail('Only the platform admin can do this.', 403);
}

if ($action === 'admin-overview' && $method === 'GET') {
    $shops = [];
    $rows = $pdo->query(
        'SELECT s.id, s.name, s.created_at, u.display_name, u.email,
                (SELECT COUNT(*) FROM pos_shop_members m WHERE m.shop_id = s.id) AS staff,
                (SELECT COUNT(*) FROM pos_records r WHERE r.shop_id = s.id AND r.deleted = 0) AS records
         FROM pos_shops s JOIN pos_users u ON u.id = s.owner_user_id ORDER BY s.created_at DESC LIMIT 1000'
    )->fetchAll();
    foreach ($rows as $row) {
        $shops[] = [
            'id' => $row['id'],
            'name' => $row['name'],
            'ownerName' => $row['display_name'],
            'ownerEmail' => $row['email'],
            'createdAt' => $row['created_at'],
            'staff' => (int)$row['staff'],
            'records' => (int)$row['records'],
            'subscription' => shop_subscription($pdo, (string)$row['id']),
        ];
    }
    $payments = $pdo->query(
        "SELECT p.*, s.name AS shop_name, u.email AS owner_email
         FROM pos_payments p JOIN pos_shops s ON s.id = p.shop_id JOIN pos_users u ON u.id = s.owner_user_id
         ORDER BY (p.status = 'pending') DESC, p.id DESC LIMIT 200"
    )->fetchAll();
    $settings = billing_settings($pdo);
    respond([
        'ok' => true,
        'shops' => $shops,
        'payments' => array_map('payment_row', $payments),
        'settings' => public_settings($settings),
    ]);
}

if ($method !== 'POST') {
    fail('Unknown request.', 404);
}
$data = request_data();

try {
    if ($action === 'admin-review') {
        $approve = !empty($data['approve']);
        $pdo->beginTransaction();
        $query = $pdo->prepare("SELECT * FROM pos_payments WHERE id = ? AND status = 'pending' FOR UPDATE");
        $query->execute([(int)($data['id'] ?? 0)]);
        $payment = $query->fetch();
        if (!$payment) {
            $pdo->rollBack();
            fail('This payment has already been reviewed.', 409);
        }
        $update = $pdo->prepare('UPDATE pos_payments SET status = ?, note = ?, reviewed_at = NOW() WHERE id = ?');
        $update->execute([$approve ? 'approved' : 'rejected', clip(value($data, 'note'), 250), $payment['id']]);
        if ($approve) {
            extend_subscription($pdo, (string)$payment['shop_id'], BILLING_PLANS[$payment['plan']] ?? '1 MONTH');
        }
        $pdo->commit();
        respond(['ok' => true]);
    }

    if ($action === 'admin-extend') {
        $days = (int)($data['days'] ?? 0);
        if ($days < 1 || $days > 3660) {
            fail('Enter a number of days between 1 and 3660.');
        }
        extend_subscription($pdo, value($data, 'shopId'), $days . ' DAY');
        respond(['ok' => true]);
    }

    if ($action === 'admin-suspend') {
        $store = $pdo->prepare('INSERT INTO pos_subscriptions (shop_id, suspended) VALUES (?, ?) ON DUPLICATE KEY UPDATE suspended = VALUES(suspended)');
        $store->execute([value($data, 'shopId'), empty($data['suspended']) ? 0 : 1]);
        respond(['ok' => true]);
    }

    if ($action === 'admin-verify') {
        // For an owner whose confirmation email never arrived.
        $confirm = $pdo->prepare(
            'UPDATE pos_email_verifications v JOIN pos_shops s ON s.owner_user_id = v.user_id SET v.verified_at = NOW()
             WHERE s.id = ? AND v.verified_at IS NULL'
        );
        $confirm->execute([value($data, 'shopId')]);
        respond(['ok' => true]);
    }

    if ($action === 'admin-settings') {
        if (isset($data['verify_grace_days']) && (!is_numeric($data['verify_grace_days']) || (int)$data['verify_grace_days'] < 0 || (int)$data['verify_grace_days'] > 365)) {
            fail('Enter the days allowed before email confirmation as a number between 0 and 365.');
        }
        foreach (['price_monthly', 'price_yearly'] as $key) {
            if (!is_numeric($data[$key] ?? null) || (float)$data[$key] < 0) {
                fail('Enter the prices as numbers.');
            }
        }
        if (!is_numeric($data['trial_days'] ?? null) || (int)$data['trial_days'] < 0 || (int)$data['trial_days'] > 365) {
            fail('Enter the free trial as a number of days between 0 and 365.');
        }
        save_billing_settings($pdo, $data);
        respond(['ok' => true, 'settings' => public_settings(billing_settings($pdo))]);
    }
} catch (RuntimeException $error) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fail($error->getMessage());
} catch (PDOException) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fail('The change could not be saved. Check the details and try again.', 500);
}

fail('Unknown request.', 404);
