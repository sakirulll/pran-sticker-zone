<?php
// Copy this file outside public_html as /home/pranmzcs/pos-private-config.php.
// Never put the real password in GitHub or in a public website folder.
return [
    'db_host' => 'localhost',
    'db_name' => 'pranmzcs_pranmzcs_posapp',
    'db_user' => 'pranmzcs_pranmzcs_posuser',
    'db_password' => 'PASTE_THE_DATABASE_PASSWORD_HERE',

    // Optional. The address of the site, used in password reset emails.
    // Leave it out to use the address the visitor came in on.
    // 'app_url' => 'https://pranstickerzone.com',

    // Optional. The address emails are sent from. It should be a mailbox that
    // exists on this hosting account, or the emails may land in spam.
    // 'mail_from' => 'no-reply@pranstickerzone.com',
];
