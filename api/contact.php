<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/subscription.php';

// What anyone may know before signing up: the prices, the length of the free
// trial and how to get help. Shown on the login screen, the Help page and the
// Terms and Privacy page.

$settings = billing_settings(db());
respond([
    'priceMonthly' => (float)$settings['price_monthly'],
    'priceYearly' => (float)$settings['price_yearly'],
    'trialDays' => (int)$settings['trial_days'],
    'supportPhone' => $settings['support_phone'],
    'supportWhatsapp' => $settings['support_whatsapp'],
    'supportEmail' => $settings['support_email'],
    'supportFacebook' => $settings['support_facebook'],
    'supportHours' => $settings['support_hours'],
]);
