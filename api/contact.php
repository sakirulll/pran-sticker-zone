<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/subscription.php';

// What anyone may know before signing up: the prices, the length of the free
// trial and the number to call for help. Shown on the Terms and Privacy page.

$settings = billing_settings(db());
respond([
    'priceMonthly' => (float)$settings['price_monthly'],
    'priceYearly' => (float)$settings['price_yearly'],
    'trialDays' => (int)$settings['trial_days'],
    'supportPhone' => $settings['support_phone'],
]);
