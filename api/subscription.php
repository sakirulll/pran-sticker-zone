<?php
declare(strict_types=1);

// Who may use the software and until when. A new shop gets a free trial; after
// that it needs a paid period, which the platform admin grants by approving a
// payment. This file only defines functions; shop.php and billing.php call them.

const BILLING_DEFAULTS = [
    'price_monthly' => '100',
    'price_yearly' => '999',
    'trial_days' => '14',
    'bkash_number' => '',
    'nagad_number' => '',
    'support_phone' => '',
];
const BILLING_PLANS = ['monthly' => '1 MONTH', 'yearly' => '1 YEAR'];

function billing_settings(PDO $pdo): array
{
    $settings = BILLING_DEFAULTS;
    foreach ($pdo->query("SELECT name, value FROM pos_meta WHERE name LIKE 'billing\\_%'")->fetchAll() as $row) {
        $key = substr((string)$row['name'], strlen('billing_'));
        if (array_key_exists($key, $settings)) {
            $settings[$key] = (string)$row['value'];
        }
    }
    return $settings;
}

function save_billing_settings(PDO $pdo, array $values): void
{
    $store = $pdo->prepare('REPLACE INTO pos_meta (name, value) VALUES (?, ?)');
    foreach (BILLING_DEFAULTS as $key => $unused) {
        if (array_key_exists($key, $values)) {
            $store->execute(['billing_' . $key, clip(trim((string)$values[$key]), 200)]);
        }
    }
}

// The platform admin runs the software for every shop. Emails listed under
// 'admin_emails' in the private config are admins; if nobody has been made an
// admin yet, the owner of the oldest shop becomes one, so a fresh install has
// someone in charge without editing the server.
function is_admin(PDO $pdo, array $user): bool
{
    $listed = config()['admin_emails'] ?? [];
    if (is_array($listed) && in_array(strtolower((string)$user['email']), array_map('strtolower', array_map('strval', $listed)), true)) {
        return true;
    }
    if ((int)$pdo->query('SELECT COUNT(*) FROM pos_admins')->fetchColumn() === 0) {
        $pdo->exec('INSERT IGNORE INTO pos_admins (user_id) SELECT owner_user_id FROM pos_shops ORDER BY created_at ASC, id ASC LIMIT 1');
    }
    $query = $pdo->prepare('SELECT 1 FROM pos_admins WHERE user_id = ?');
    $query->execute([$user['id']]);
    return (bool)$query->fetchColumn();
}

// state: "lifetime" (the admin's own shop), "active" (paid), "trial",
// "expired" or "suspended". secondsLeft counts down to the end of the paid
// period or trial. All date arithmetic is done by the database so the web
// server's clock and time zone do not matter.
function shop_subscription(PDO $pdo, string $shopId): array
{
    $trialDays = max(0, (int)billing_settings($pdo)['trial_days']);
    $query = $pdo->prepare(
        "SELECT u.id, u.email, COALESCE(b.suspended, 0) AS suspended,
                TIMESTAMPDIFF(SECOND, NOW(), b.paid_until) AS paid_left,
                TIMESTAMPDIFF(SECOND, NOW(), s.created_at + INTERVAL {$trialDays} DAY) AS trial_left
         FROM pos_shops s JOIN pos_users u ON u.id = s.owner_user_id
         LEFT JOIN pos_subscriptions b ON b.shop_id = s.id WHERE s.id = ?"
    );
    $query->execute([$shopId]);
    $row = $query->fetch();
    if (!$row) {
        return ['state' => 'expired', 'secondsLeft' => 0];
    }
    $paidLeft = $row['paid_left'] === null ? 0 : (int)$row['paid_left'];
    $trialLeft = (int)$row['trial_left'];
    if (is_admin($pdo, $row)) {
        return ['state' => 'lifetime', 'secondsLeft' => 0];
    }
    if ((int)$row['suspended'] === 1) {
        return ['state' => 'suspended', 'secondsLeft' => 0];
    }
    if ($paidLeft > 0) {
        return ['state' => 'active', 'secondsLeft' => $paidLeft];
    }
    if ($trialLeft > 0) {
        return ['state' => 'trial', 'secondsLeft' => $trialLeft];
    }
    return ['state' => 'expired', 'secondsLeft' => 0];
}

function subscription_allows_use(array $subscription): bool
{
    return in_array($subscription['state'], ['lifetime', 'active', 'trial'], true);
}

// Adds a period on top of whatever the shop still has, so paying early or
// during the trial never loses days. $interval is SQL, e.g. "1 MONTH" or "30 DAY".
function extend_subscription(PDO $pdo, string $shopId, string $interval): void
{
    if (preg_match('/^\d{1,4} (DAY|MONTH|YEAR)$/', $interval) !== 1) {
        throw new RuntimeException('That period is not valid.');
    }
    $trialDays = max(0, (int)billing_settings($pdo)['trial_days']);
    $create = $pdo->prepare('INSERT IGNORE INTO pos_subscriptions (shop_id) VALUES (?)');
    $create->execute([$shopId]);
    $extend = $pdo->prepare(
        "UPDATE pos_subscriptions b JOIN pos_shops s ON s.id = b.shop_id
         SET b.paid_until = GREATEST(NOW(), COALESCE(b.paid_until, NOW()), s.created_at + INTERVAL {$trialDays} DAY) + INTERVAL {$interval}
         WHERE b.shop_id = ?"
    );
    $extend->execute([$shopId]);
}
