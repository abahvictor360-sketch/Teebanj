<?php
if (PHP_SAPI !== "cli") {
    http_response_code(404);
    exit();
}
require dirname(__DIR__) . "/api/bootstrap.php";
require dirname(__DIR__) . "/api/commerce.php";
$failed = 0;
foreach (
    query(
        "SELECT * FROM orders WHERE status='pending' AND square_order_id IS NOT NULL ORDER BY updated_at LIMIT 100",
    )->fetchAll()
    as $o
) {
    try {
        refresh_order($o);
    } catch (Throwable $e) {
        $failed++;
        fwrite(STDERR, $o["id"] . ": " . $e->getMessage() . PHP_EOL);
    }
}
exit($failed ? 1 : 0);
