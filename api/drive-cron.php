<?php
declare(strict_types=1);

// Takes today's Google Drive copy. Meant for a daily cron job in cPanel:
//   php /home/pranmzcs/public_html/api/drive-cron.php
// The site also takes the copy by itself when the first shop is opened each
// day, so the cron job only matters on a day when nobody opens a shop.

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/drivebackup.php';

$pdo = db();
if (drive_meta($pdo, 'refresh_token') === '') {
    echo "Google Drive is not connected.\n";
    exit(1);
}
if (drive_meta($pdo, 'attempt_day') === date('Y-m-d') && drive_meta($pdo, 'last_ok') === '1') {
    echo "Today's copy is already on Drive.\n";
    exit(0);
}
drive_meta_set($pdo, 'attempt_day', date('Y-m-d'));
$result = drive_backup_run($pdo);
echo $result['message'], "\n";
exit($result['ok'] ? 0 : 1);
