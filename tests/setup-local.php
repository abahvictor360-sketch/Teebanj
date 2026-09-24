<?php
if (PHP_SAPI !== "cli") {
    exit(1);
}
$root = dirname(__DIR__);
if (is_file($root . "/config.local.php")) {
    fwrite(STDERR, "config.local.php already exists; refusing to overwrite.\n");
    exit(1);
}
$pdo = new PDO("mysql:host=127.0.0.1;port=33317;charset=utf8mb4", "root", "", [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);
$pdo->exec("CREATE DATABASE IF NOT EXISTS teebanj_test CHARACTER SET utf8mb4");
$pdo->exec("USE teebanj_test");
$pdo->exec(file_get_contents($root . "/database/schema.sql"));
$pdo->exec(file_get_contents($root . "/database/preview.sql"));
$c = require $root . "/config.example.php";
$c["db"] = [
    "host" => "127.0.0.1",
    "port" => 33317,
    "name" => "teebanj_test",
    "user" => "root",
    "password" => "",
];
$c["base_url"] = "http://127.0.0.1:8087";
$c["admin_password_hash"] = password_hash(
    "TeebanjLocalTest123!",
    PASSWORD_DEFAULT,
);
file_put_contents(
    $root . "/config.local.php",
    "<?php\n// LOCAL TEST ONLY. Do not upload.\nreturn " .
        var_export($c, true) .
        ";\n",
);
echo "Local test database and ignored local configuration created.\n";
