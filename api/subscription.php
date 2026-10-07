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
    // How long a new owner may use the shop before the email address must be confirmed.
    'verify_grace_days' => '3',
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
// "expired", "suspended", or "unverified" (the owner has not confirmed the
// email address within the allowed days). secondsLeft counts down to the end of the paid
// period or trial. All date arithmetic is done by the database so the web
// server's clock and time zone do not matter.
function shop_subscription(PDO $pdo, string $shopId): array
{
    $settings = billing_settings($pdo);
    $trialDays = max(0, (int)$settings['trial_days']);
    $graceSeconds = max(0, (int)$settings['verify_grace_days']) * 86400;
    $query = $pdo->prepare(
        "SELECT u.id, u.email, COALESCE(b.suspended, 0) AS suspended,
                (v.user_id IS NOT NULL AND v.verified_at IS NULL) AS unverified,
                TIMESTAMPDIFF(SECOND, v.created_at, NOW()) AS unverified_for,
                TIMESTAMPDIFF(SECOND, NOW(), b.paid_until) AS paid_left,
                TIMESTAMPDIFF(SECOND, NOW(), s.created_at + INTERVAL {$trialDays} DAY) AS trial_left
         FROM pos_shops s JOIN pos_users u ON u.id = s.owner_user_id
         LEFT JOIN pos_subscriptions b ON b.shop_id = s.id
         LEFT JOIN pos_email_verifications v ON v.user_id = u.id WHERE s.id = ?"
    );
    $query->execute([$shopId]);
    $row = $query->fetch();
    if (!$row) {
        return ['state' => 'expired', 'secondsLeft' => 0, 'emailVerified' => true];
    }
    $result = subscription_state($pdo, $row, $graceSeconds);
    $result['emailVerified'] = (int)$row['unverified'] === 0;
    return $result;
}

function subscription_state(PDO $pdo, array $row, int $graceSeconds): array
{
    $paidLeft = $row['paid_left'] === null ? 0 : (int)$row['paid_left'];
    $trialLeft = (int)$row['trial_left'];
    if (is_admin($pdo, $row)) {
        return ['state' => 'lifetime', 'secondsLeft' => 0];
    }
    if ((int)$row['suspended'] === 1) {
        return ['state' => 'suspended', 'secondsLeft' => 0];
    }
    if ((int)$row['unverified'] === 1 && (int)$row['unverified_for'] >= $graceSeconds) {
        return ['state' => 'unverified', 'secondsLeft' => 0];
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

// Sends the owner a link that confirms the email address. Calling it again (a
// resend) replaces the link but keeps the date the allowed days are counted from;
// a changed address starts the count again.
function start_email_verification(PDO $pdo, string $userId, string $email, string $name, bool $restart): void
{
    $token = bin2hex(random_bytes(32));
    $store = $pdo->prepare(
        'INSERT INTO pos_email_verifications (user_id, token_hash, created_at, last_sent_at) VALUES (?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE token_hash = VALUES(token_hash), last_sent_at = NOW(), verified_at = NULL,
                                 created_at = IF(?, NOW(), created_at)'
    );
    $store->execute([$userId, hash('sha256', $token), $restart ? 1 : 0]);
    $link = app_url() . '/?verify=' . $token;
    send_mail(
        $email,
        'Confirm your email - ' . APP_NAME,
        "Hello {$name},\n\nOpen this link to confirm your email address for " . APP_NAME . ":\n\n{$link}\n\n"
        . "আপনার email address নিশ্চিত করতে উপরের link টি খুলুন।\n\n"
        . "If you did not create this account, ignore this email.\n"
    );
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
