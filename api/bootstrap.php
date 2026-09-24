<?php
declare(strict_types=1);
function config(): array
{
    static $c;
    if ($c === null) {
        $p = dirname(__DIR__) . "/config.local.php";
        if (!is_file($p)) {
            throw new RuntimeException("Store configuration is missing.");
        }
        $c = require $p;
    }
    return $c;
}
function db(): PDO
{
    static $db;
    if (!$db) {
        $c = config()["db"];
        $db = new PDO(
            "mysql:host={$c["host"]};port={$c["port"]};dbname={$c["name"]};charset=utf8mb4",
            $c["user"],
            $c["password"],
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ],
        );
    }
    return $db;
}
function query(string $sql, array $args = []): PDOStatement
{
    $q = db()->prepare($sql);
    $q->execute($args);
    return $q;
}
function respond(array $data, int $status = 200): never
{
    http_response_code($status);
    header("Content-Type: application/json; charset=utf-8");
    header("Cache-Control: no-store");
    echo json_encode($data, JSON_THROW_ON_ERROR | JSON_HEX_TAG | JSON_HEX_AMP);
    exit();
}
function fail(string $message, int $status = 400): never
{
    respond(["error" => $message], $status);
}
function start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    ini_set("session.use_strict_mode", "1");
    session_name("teebanj_session");
    session_set_cookie_params([
        "httponly" => true,
        "secure" => str_starts_with(config()["base_url"], "https://"),
        "samesite" => "Lax",
        "path" => "/",
    ]);
    session_start();
    $_SESSION["csrf"] ??= bin2hex(random_bytes(32));
    $_SESSION["owner"] ??= bin2hex(random_bytes(32));
}
function input(): array
{
    if (($_SERVER["REQUEST_METHOD"] ?? "") !== "POST") {
        fail("Use POST.", 405);
    }
    if (!hash_equals($_SESSION["csrf"], $_SERVER["HTTP_X_CSRF_TOKEN"] ?? "")) {
        fail("Refresh the page and try again.", 403);
    }
    $raw = file_get_contents("php://input", false, null, 0, 65537);
    if (strlen($raw) > 65536) {
        fail("Request too large.", 413);
    }
    try {
        $body = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
    } catch (JsonException $e) {
        fail("Invalid JSON.");
    }
    if (!is_array($body)) {
        fail("Invalid request.");
    }
    return $body;
}
function field(array $data, string $key, int $max = 254): string
{
    $v = $data[$key] ?? "";
    if (!is_string($v) || strlen(trim($v)) < 1 || strlen($v) > $max) {
        fail("Check {$key}.");
    }
    return trim($v);
}
function email(array $d): string
{
    $v = strtolower(field($d, "email"));
    if (!filter_var($v, FILTER_VALIDATE_EMAIL)) {
        fail("Enter a valid email address.");
    }
    return $v;
}
function admin(): void
{
    if (empty($_SESSION["admin"])) {
        fail("Administrator sign-in required.", 401);
    }
}
function throttle(string $purpose, int $max = 20): void
{
    $key = hash(
        "sha256",
        $purpose .
            "|" .
            ($_SERVER["REMOTE_ADDR"] ?? "cli") .
            "|" .
            intdiv(time(), 900),
    );
    query(
        "INSERT INTO rate_limits(bucket,attempts,expires_at) VALUES(?,1,?) ON DUPLICATE KEY UPDATE attempts=attempts+1",
        [$key, time() + 900],
    );
    if (
        query("SELECT attempts FROM rate_limits WHERE bucket=?", [
            $key,
        ])->fetchColumn() > $max
    ) {
        fail("Too many attempts. Try again in 15 minutes.", 429);
    }
    query("DELETE FROM rate_limits WHERE expires_at<?", [time()]);
}
function square(string $method, string $path, ?array $body = null): array
{
    $c = config()["square"];
    if (!$c["access_token"] || !$c["location_id"]) {
        throw new RuntimeException("Square is not configured.");
    }
    if (!in_array($c["environment"], ["sandbox", "production"], true)) {
        throw new RuntimeException("Invalid Square environment.");
    }
    $base =
        $c["environment"] === "production"
            ? "https://connect.squareup.com"
            : "https://connect.squareupsandbox.com";
    $ch = curl_init($base . "/v2" . $path);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 35,
        CURLOPT_HTTPHEADER => [
            "Authorization: Bearer " . $c["access_token"],
            "Square-Version: " . $c["version"],
            "Content-Type: application/json",
        ],
    ]);
    if ($body !== null) {
        curl_setopt(
            $ch,
            CURLOPT_POSTFIELDS,
            json_encode($body, JSON_THROW_ON_ERROR),
        );
    }
    $raw = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    if ($raw === false || $status < 200 || $status >= 300) {
        throw new RuntimeException(
            "Square request failed (" .
                $status .
                "). Retry safely or inspect Square API logs.",
        );
    }
    return json_decode($raw, true, 128, JSON_THROW_ON_ERROR);
}
function valid_signature(
    string $raw,
    string $signature,
    string $url,
    string $key,
): bool {
    return $key !== "" &&
        hash_equals(
            base64_encode(hash_hmac("sha256", $url . $raw, $key, true)),
            $signature,
        );
}
