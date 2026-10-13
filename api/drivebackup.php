<?php
declare(strict_types=1);

// Copies of everything on the site, sent to the platform admin's Google Drive.
// Each day the whole database goes up, and once a week the uploaded pictures
// too; copies older than DRIVE_KEEP_DAYS are deleted from Drive. The admin
// connects a Google account once, on the Drive Backup page. This file only
// defines functions; drive.php, drive-cron.php and shop.php call them.

const DRIVE_KEEP_DAYS = 30;
const DRIVE_IMAGES_EVERY_DAYS = 7;
const DRIVE_FOLDER = 'HishabPOS Backups';
// Lets the site see only the files it put on Drive itself, nothing else there.
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

function drive_meta(PDO $pdo, string $name): string
{
    $query = $pdo->prepare('SELECT value FROM pos_meta WHERE name = ?');
    $query->execute(['drive_' . $name]);
    $value = $query->fetchColumn();
    return $value === false ? '' : (string)$value;
}

function drive_meta_set(PDO $pdo, string $name, string $value): void
{
    $pdo->prepare('REPLACE INTO pos_meta (name, value) VALUES (?, ?)')->execute(['drive_' . $name, clip($value, 255)]);
}

// Google's addresses. A development machine points them at a stand-in server.
function google_url(string $which): string
{
    $defaults = [
        'auth' => 'https://accounts.google.com/o/oauth2/v2/auth',
        'token' => 'https://oauth2.googleapis.com/token',
        'api' => 'https://www.googleapis.com',
    ];
    $configured = config()['google_' . $which . '_url'] ?? '';
    return is_string($configured) && $configured !== '' ? rtrim($configured, '/') : $defaults[$which];
}

// Where Google sends the admin back after they allow access. It has to match,
// letter for letter, the address entered in the Google Cloud console.
function drive_redirect_uri(): string
{
    return app_url() . '/api/drive.php';
}

/** One web request. Returns [status code, headers with lower-case names, body]. */
function drive_http(string $method, string $url, array $headers = [], string $body = ''): array
{
    if (function_exists('curl_init')) {
        $request = curl_init($url);
        curl_setopt_array($request, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HEADER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => 20,
            CURLOPT_TIMEOUT => 180,
        ]);
        if ($body !== '' || in_array($method, ['POST', 'PUT', 'PATCH'], true)) {
            curl_setopt($request, CURLOPT_POSTFIELDS, $body);
        }
        $answer = curl_exec($request);
        if ($answer === false) {
            $problem = curl_error($request);
            curl_close($request);
            throw new RuntimeException('Google could not be reached: ' . $problem);
        }
        $status = (int)curl_getinfo($request, CURLINFO_RESPONSE_CODE);
        $headerSize = (int)curl_getinfo($request, CURLINFO_HEADER_SIZE);
        curl_close($request);
        $headerLines = explode("\r\n", substr((string)$answer, 0, $headerSize));
        $content = substr((string)$answer, $headerSize);
    } else {
        $context = stream_context_create(['http' => [
            'method' => $method,
            'header' => implode("\r\n", array_merge($headers, ['Content-Length: ' . strlen($body)])),
            'content' => $body,
            'ignore_errors' => true,
            'follow_location' => 0,
            'timeout' => 180,
        ]]);
        $content = @file_get_contents($url, false, $context);
        if ($content === false || empty($http_response_header)) {
            throw new RuntimeException('Google could not be reached.');
        }
        $headerLines = $http_response_header;
        $status = 0;
        foreach ($headerLines as $line) {
            // After a "100 Continue" the real status line comes later, so the last one counts.
            if (preg_match('#^HTTP/\S+\s+(\d{3})#', $line, $found) === 1) {
                $status = (int)$found[1];
            }
        }
    }
    $named = [];
    foreach ($headerLines as $line) {
        $colon = strpos($line, ':');
        if ($colon !== false) {
            $named[strtolower(trim(substr($line, 0, $colon)))] = trim(substr($line, $colon + 1));
        }
    }
    return [$status, $named, (string)$content];
}

/** A request to the Drive API, with the answer decoded. Anything but success is an error. */
function drive_api(string $token, string $method, string $path, ?array $json = null): array
{
    $headers = ['Authorization: Bearer ' . $token];
    $body = '';
    if ($json !== null) {
        $headers[] = 'Content-Type: application/json; charset=UTF-8';
        $body = (string)json_encode($json, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
    [$status, , $content] = drive_http($method, google_url('api') . $path, $headers, $body);
    if ($status < 200 || $status >= 300) {
        throw new RuntimeException('Google Drive refused the request (' . $status . '): ' . drive_error_text($content));
    }
    $decoded = json_decode($content, true);
    return is_array($decoded) ? $decoded : [];
}

function drive_error_text(string $content): string
{
    $decoded = json_decode($content, true);
    $message = is_array($decoded)
        ? ($decoded['error_description'] ?? (is_array($decoded['error'] ?? null) ? ($decoded['error']['message'] ?? '') : ($decoded['error'] ?? '')))
        : '';
    return clip(is_string($message) && $message !== '' ? $message : 'no reason given', 160);
}

/** Trades the stored permission for a short-lived key to use Drive with. */
function drive_access_token(PDO $pdo): string
{
    $refresh = drive_meta($pdo, 'refresh_token');
    if ($refresh === '') {
        throw new RuntimeException('Google Drive is not connected yet.');
    }
    [$status, , $content] = drive_http('POST', google_url('token'), ['Content-Type: application/x-www-form-urlencoded'], http_build_query([
        'client_id' => drive_meta($pdo, 'client_id'),
        'client_secret' => drive_meta($pdo, 'client_secret'),
        'refresh_token' => $refresh,
        'grant_type' => 'refresh_token',
    ]));
    $decoded = json_decode($content, true);
    if ($status !== 200 || !is_array($decoded) || empty($decoded['access_token'])) {
        throw new RuntimeException('Google no longer accepts the saved permission (' . drive_error_text($content) . '). Connect Google Drive again.');
    }
    return (string)$decoded['access_token'];
}

/** The id of the folder the copies go in, made the first time. */
function drive_folder(PDO $pdo, string $token): string
{
    $query = "name = '" . DRIVE_FOLDER . "' and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
    $found = drive_api($token, 'GET', '/drive/v3/files?' . http_build_query(['q' => $query, 'fields' => 'files(id)', 'pageSize' => 10]));
    if (!empty($found['files'][0]['id'])) {
        return (string)$found['files'][0]['id'];
    }
    $made = drive_api($token, 'POST', '/drive/v3/files?fields=id', ['name' => DRIVE_FOLDER, 'mimeType' => 'application/vnd.google-apps.folder']);
    if (empty($made['id'])) {
        throw new RuntimeException('The backup folder could not be made on Google Drive.');
    }
    return (string)$made['id'];
}

/** The copies now on Drive, newest first: [id, name, size, createdTime]. */
function drive_files(string $token, string $folder): array
{
    $files = [];
    $page = '';
    do {
        $answer = drive_api($token, 'GET', '/drive/v3/files?' . http_build_query(array_filter([
            'q' => "'" . $folder . "' in parents and trashed = false",
            'fields' => 'nextPageToken, files(id, name, size, createdTime)',
            'orderBy' => 'createdTime desc',
            'pageSize' => 200,
            'pageToken' => $page,
        ])));
        foreach ($answer['files'] ?? [] as $file) {
            $files[] = ['id' => (string)$file['id'], 'name' => (string)($file['name'] ?? ''), 'size' => (int)($file['size'] ?? 0), 'createdTime' => (string)($file['createdTime'] ?? '')];
        }
        $page = (string)($answer['nextPageToken'] ?? '');
    } while ($page !== '');
    return $files;
}

/** Sends a file to the folder a piece at a time, so a big one never has to fit in memory. */
function drive_upload(string $token, string $folder, string $name, string $path): void
{
    $size = (int)filesize($path);
    [$status, $headers, $content] = drive_http('POST', google_url('api') . '/upload/drive/v3/files?uploadType=resumable', [
        'Authorization: Bearer ' . $token,
        'Content-Type: application/json; charset=UTF-8',
        'X-Upload-Content-Length: ' . $size,
    ], (string)json_encode(['name' => $name, 'parents' => [$folder]]));
    $session = $headers['location'] ?? '';
    if ($status !== 200 || $session === '') {
        throw new RuntimeException('Google Drive would not start the upload (' . $status . '): ' . drive_error_text($content));
    }
    // Google wants every piece but the last to be a multiple of 256 KB.
    $piece = max(1, (int)(config()['google_piece_units'] ?? 16)) * 262144;
    $file = fopen($path, 'rb');
    if ($file === false) {
        throw new RuntimeException('The copy could not be read back for sending.');
    }
    try {
        $sent = 0;
        do {
            $chunk = $size > 0 ? (string)fread($file, min($piece, $size - $sent)) : '';
            $range = $size > 0 ? 'bytes ' . $sent . '-' . ($sent + strlen($chunk) - 1) . '/' . $size : 'bytes */0';
            [$status, , $content] = drive_http('PUT', $session, ['Content-Range: ' . $range, 'Content-Type: application/octet-stream'], $chunk);
            $sent += strlen($chunk);
            // 308 means "got it, send the rest"; 200 or 201 means the file is complete.
            if ($status !== 308 && ($status < 200 || $status >= 300)) {
                throw new RuntimeException('Google Drive stopped the upload (' . $status . '): ' . drive_error_text($content));
            }
        } while ($status === 308 && $sent < $size);
        if ($status === 308) {
            throw new RuntimeException('Google Drive did not confirm the upload.');
        }
    } finally {
        fclose($file);
    }
}

/** Writes every table, structure and rows, as SQL that phpMyAdmin can import. */
function dump_database(PDO $pdo, string $path): void
{
    $out = gzopen($path, 'wb6');
    if ($out === false) {
        throw new RuntimeException('The database copy could not be written.');
    }
    try {
        gzwrite($out, "-- " . APP_NAME . " database, " . date('Y-m-d H:i') . "\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\n\n");
        $tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
        foreach ($tables as $table) {
            $table = (string)$table;
            $quoted = '`' . str_replace('`', '``', $table) . '`';
            $create = $pdo->query('SHOW CREATE TABLE ' . $quoted)->fetch(PDO::FETCH_NUM);
            gzwrite($out, "DROP TABLE IF EXISTS {$quoted};\n" . $create[1] . ";\n\n");
            // The permission to use this Drive is not put on the Drive itself.
            $where = $table === 'pos_meta' ? " WHERE name NOT LIKE 'drive\\_%'" : '';
            $rows = $pdo->query('SELECT * FROM ' . $quoted . $where);
            $batch = [];
            $flush = function () use (&$batch, $out, $quoted): void {
                if ($batch) {
                    gzwrite($out, "INSERT INTO {$quoted} VALUES\n" . implode(",\n", $batch) . ";\n");
                    $batch = [];
                }
            };
            while (($row = $rows->fetch(PDO::FETCH_NUM)) !== false) {
                $batch[] = '(' . implode(',', array_map(static fn($value) => $value === null ? 'NULL' : $pdo->quote((string)$value), $row)) . ')';
                if (count($batch) >= 200) {
                    $flush();
                }
            }
            $flush();
            gzwrite($out, "\n");
        }
        gzwrite($out, "SET FOREIGN_KEY_CHECKS = 1;\n");
    } finally {
        gzclose($out);
    }
}

/** Packs the uploaded pictures into one .tar.gz. Returns how many files went in. */
function pack_uploads(string $path): int
{
    $root = dirname(__DIR__) . '/uploads';
    if (!is_dir($root)) {
        return 0;
    }
    $out = gzopen($path, 'wb6');
    if ($out === false) {
        throw new RuntimeException('The pictures could not be packed.');
    }
    $count = 0;
    try {
        $walker = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS));
        foreach ($walker as $file) {
            $name = 'uploads/' . str_replace('\\', '/', substr($file->getPathname(), strlen($root) + 1));
            if (!$file->isFile() || str_starts_with(basename($name), '.') || strlen($name) > 100) {
                continue;
            }
            $size = $file->getSize();
            // A tar header: the name, then sizes as octal text, with a checksum over the block.
            $header = pack('a100a8a8a8a12a12', $name, '0000644', '0000000', '0000000', sprintf('%011o', $size), sprintf('%011o', $file->getMTime()))
                . '        ' . '0' . str_repeat("\0", 100) . "ustar\0" . '00' . str_repeat("\0", 247);
            $header = substr_replace($header, sprintf('%06o', array_sum(array_map('ord', str_split($header)))) . "\0 ", 148, 8);
            gzwrite($out, $header);
            $source = fopen($file->getPathname(), 'rb');
            if ($source === false) {
                throw new RuntimeException('A picture could not be read.');
            }
            while (!feof($source)) {
                gzwrite($out, (string)fread($source, 262144));
            }
            fclose($source);
            if ($size % 512 !== 0) {
                gzwrite($out, str_repeat("\0", 512 - $size % 512));
            }
            $count++;
        }
        gzwrite($out, str_repeat("\0", 1024));
    } finally {
        gzclose($out);
    }
    return $count;
}

/**
 * Takes the copies and sends them, then clears out the old ones. $everything
 * also sends the pictures when their week is not up yet. Returns what was done.
 */
function drive_backup_run(PDO $pdo, bool $everything = false): array
{
    @set_time_limit(600);
    ignore_user_abort(true);
    $day = date('Y-m-d');
    $work = sys_get_temp_dir() . '/pos-drive-' . bin2hex(random_bytes(6));
    $made = [];
    try {
        $token = drive_access_token($pdo);
        $folder = drive_folder($pdo, $token);

        $database = $work . '.sql.gz';
        $made[] = $database;
        dump_database($pdo, $database);
        $send = ['hishabpos-database-' . $day . '.sql.gz' => $database];

        $lastImages = drive_meta($pdo, 'images_day');
        $imagesDue = $everything || $lastImages === '' || strtotime($lastImages) <= strtotime($day) - DRIVE_IMAGES_EVERY_DAYS * 86400;
        if ($imagesDue) {
            $images = $work . '.tar.gz';
            $made[] = $images;
            if (pack_uploads($images) > 0) {
                $send['hishabpos-pictures-' . $day . '.tar.gz'] = $images;
            }
        }

        $existing = drive_files($token, $folder);
        $removed = 0;
        foreach ($send as $name => $path) {
            // A second run on the same day replaces that day's copy.
            foreach ($existing as $file) {
                if ($file['name'] === $name) {
                    drive_api($token, 'DELETE', '/drive/v3/files/' . rawurlencode($file['id']));
                }
            }
            drive_upload($token, $folder, $name, $path);
        }
        if ($imagesDue) {
            drive_meta_set($pdo, 'images_day', $day);
        }
        $limit = time() - DRIVE_KEEP_DAYS * 86400;
        foreach ($existing as $file) {
            $created = strtotime($file['createdTime']);
            if ($created !== false && $created < $limit && !isset($send[$file['name']])) {
                drive_api($token, 'DELETE', '/drive/v3/files/' . rawurlencode($file['id']));
                $removed++;
            }
        }
        $result = ['ok' => true, 'sent' => array_keys($send), 'removed' => $removed, 'message' => count($send) . ' sent, ' . $removed . ' old removed'];
    } catch (Throwable $error) {
        $result = ['ok' => false, 'sent' => [], 'removed' => 0, 'message' => clip($error->getMessage(), 240)];
    } finally {
        foreach ($made as $path) {
            @unlink($path);
        }
    }
    drive_meta_set($pdo, 'last_run', date('Y-m-d H:i'));
    drive_meta_set($pdo, 'last_ok', $result['ok'] ? '1' : '0');
    drive_meta_set($pdo, 'last_result', $result['message']);
    return $result;
}

/** Runs today's copy if it has not been tried yet. Never lets a problem out. */
function drive_backup_if_due(PDO $pdo): void
{
    try {
        if (drive_meta($pdo, 'refresh_token') === '' || drive_meta($pdo, 'attempt_day') === date('Y-m-d')) {
            return;
        }
        // Several shops open at once in the morning; only one of them takes the copy.
        if ((int)$pdo->query("SELECT GET_LOCK('pos_drive_backup', 0)")->fetchColumn() !== 1) {
            return;
        }
        try {
            if (drive_meta($pdo, 'attempt_day') !== date('Y-m-d')) {
                drive_meta_set($pdo, 'attempt_day', date('Y-m-d'));
                drive_backup_run($pdo);
            }
        } finally {
            $pdo->query("SELECT RELEASE_LOCK('pos_drive_backup')");
        }
    } catch (Throwable) {
        // A failed copy must never get in the way of a shop.
    }
}
