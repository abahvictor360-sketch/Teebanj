<?php
if (PHP_SAPI !== "cli") {
    http_response_code(404);
    exit();
}
fwrite(STDOUT, "Enter a new admin password (at least 12 characters): ");
$password = trim(fgets(STDIN));
if (strlen($password) < 12 || strlen($password) > 72) {
    fwrite(STDERR, "Use 12–72 bytes.\n");
    exit(1);
}
echo password_hash($password, PASSWORD_DEFAULT), PHP_EOL;
