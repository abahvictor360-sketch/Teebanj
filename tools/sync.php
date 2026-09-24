<?php
if (PHP_SAPI !== "cli") {
    http_response_code(404);
    exit();
}
require dirname(__DIR__) . "/api/bootstrap.php";
require dirname(__DIR__) . "/api/commerce.php";
try {
    echo "Imported " . sync_catalog() . " variations" . PHP_EOL;
} catch (Throwable $e) {
    fwrite(STDERR, $e->getMessage() . PHP_EOL);
    exit(1);
}
