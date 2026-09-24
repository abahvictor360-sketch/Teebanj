<?php
// Real MySQL-compatible database, deterministic Square test double; no live payment.
declare(strict_types=1);
$root = dirname(__DIR__);
$base = require $root . "/config.local.php";
if ($base["db"]["name"] !== "teebanj_test" || $base["db"]["port"] !== 33317) {
    throw new RuntimeException("Use isolated test database only.");
}
$base["checkout_enabled"] = true;
$base["square"]["location_id"] = "TESTLOC";
$base["delivery"] = [
    "NB" => [
        "shipping_cents" => 0,
        "tax_percent" => "0",
        "shipping_taxable" => false,
    ],
];
function config(): array
{
    return $GLOBALS["base"];
}
function db(): PDO
{
    static $db;
    if (!$db) {
        $db = new PDO(
            "mysql:host=127.0.0.1;port=33317;dbname=teebanj_test;charset=utf8mb4",
            "root",
            "",
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ],
        );
    }
    return $db;
}
function query(string $sql, array $args = []): PDOStatement
{
    $s = db()->prepare($sql);
    $s->execute($args);
    return $s;
}
function fail(string $m, int $code = 400): never
{
    throw new RuntimeException($m, $code);
}
function field(array $d, string $k, int $max = 254): string
{
    return (string) $d[$k];
}
function email(array $d): string
{
    return $d["email"];
}
$remoteStock = 50;
$created = 0;
$remoteOrder = [];
$remotePayment = [];
$failAfterCreate = false;
function square(string $method, string $path, ?array $data = null): array
{
    global $remoteStock,
        $created,
        $remoteOrder,
        $remotePayment,
        $failAfterCreate;
    if ($path === "/inventory/counts/batch-retrieve") {
        return [
            "counts" => [
                [
                    "catalog_object_id" => "TESTVAR",
                    "quantity" => (string) $remoteStock,
                ],
            ],
        ];
    }
    if ($path === "/catalog/batch-retrieve") {
        return [
            "objects" => [
                [
                    "id" => "TESTVAR",
                    "item_variation_data" => [
                        "track_inventory" => true,
                        "price_money" => [
                            "currency" => "CAD",
                            "amount" => 7000,
                        ],
                    ],
                ],
            ],
        ];
    }
    if ($path === "/online-checkout/payment-links") {
        $created++;
        $remoteOrder = $data["order"];
        $remoteOrder["id"] = "SO-" . $remoteOrder["reference_id"];
        $remoteOrder["total_money"] = ["amount" => 14000, "currency" => "CAD"];
        if ($failAfterCreate) {
            $failAfterCreate = false;
            throw new RuntimeException("Simulated network timeout");
        }
        return [
            "payment_link" => [
                "id" => "LINK",
                "order_id" => $remoteOrder["id"],
                "url" => "https://square.link/test",
            ],
        ];
    }
    if (str_starts_with($path, "/orders/")) {
        return ["order" => $remoteOrder];
    }
    if (str_starts_with($path, "/payments/")) {
        return ["payment" => $remotePayment];
    }
    throw new RuntimeException(
        "Unexpected Square write: " . $method . " " . $path,
    );
}
require $root . "/api/commerce.php";
function check(bool $ok, string $label): void
{
    if (!$ok) {
        throw new RuntimeException($label);
    }
    echo "PASS: $label\n";
}
$_SESSION = ["owner" => bin2hex(random_bytes(32))];
$id = bin2hex(random_bytes(16));
query(
    "INSERT INTO products(id,square_item_id,name,description,category,variation_name,price_cents,image_url,stock) VALUES('TESTVAR','TESTITEM','Integration test','Test only','fabrics','Blue',7000,'',50) ON DUPLICATE KEY UPDATE active=1,stock=50",
);
$input = [
    "id" => $id,
    "customer" => [
        "name" => "Test Customer",
        "email" => "test@example.invalid",
        "phone" => "5555555555",
        "address" => "Test address",
        "city" => "Moncton",
        "province" => "NB",
        "postal" => "E1A 1A1",
    ],
    "items" => [["id" => "TESTVAR", "qty" => 2, "price" => 1]],
];
try {
    $r = checkout($input);
    check(
        $r["id"] === $id && $created === 1,
        "checkout persisted and created one Square link",
    );
    check(
        $remoteOrder["line_items"][0]["base_price_money"]["amount"] === 7000,
        "client-supplied price ignored",
    );
    check(
        $remoteOrder["line_items"][0]["quantity"] === "2",
        "two units passed to Square",
    );
    checkout($input);
    check(
        $created === 1,
        "repeated checkout does not create duplicate Square order",
    );
    check(
        (int) query("SELECT stock FROM products WHERE id=?", [
            "TESTVAR",
        ])->fetchColumn() === 50,
        "creating checkout does not prematurely deduct stock",
    );
    $remotePayment = [
        "id" => "PAY-" . $id,
        "status" => "FAILED",
        "location_id" => "TESTLOC",
        "order_id" => $remoteOrder["id"],
        "amount_money" => ["amount" => 14000, "currency" => "CAD"],
    ];
    reconcile_payment($remotePayment["id"]);
    check(
        query("SELECT status FROM orders WHERE id=?", [$id])->fetchColumn() ===
            "pending",
        "failed payment never marks order paid",
    );
    $remotePayment["status"] = "COMPLETED";
    $remoteStock = 48;
    reconcile_payment($remotePayment["id"]);
    reconcile_payment($remotePayment["id"]);
    check(
        query("SELECT status FROM orders WHERE id=?", [$id])->fetchColumn() ===
            "paid",
        "verified completed payment marks order paid",
    );
    check(
        (int) query("SELECT stock FROM products WHERE id=?", [
            "TESTVAR",
        ])->fetchColumn() === 48,
        "50 minus 2 is 48 after payment and duplicate reconciliation",
    );
    $remotePayment["amount_money"]["amount"] = 1;
    try {
        reconcile_payment($remotePayment["id"]);
        throw new LogicException("Mismatch accepted");
    } catch (RuntimeException $e) {
        check(
            $e->getMessage() === "Payment does not match the local order.",
            "amount mismatch rejected",
        );
    }
    $other = $input;
    $other["id"] = bin2hex(random_bytes(16));
    $other["items"][0]["qty"] = 49;
    try {
        checkout($other);
        throw new LogicException("Oversell accepted");
    } catch (RuntimeException $e) {
        check(
            $e->getCode() === 409,
            "insufficient stock rejected before creating payment link",
        );
    }
    $retry = $input;
    $retry["id"] = bin2hex(random_bytes(16));
    $failAfterCreate = true;
    try {
        checkout($retry);
    } catch (RuntimeException $e) {
        check(
            $e->getMessage() === "Simulated network timeout",
            "network failure leaves retriable order",
        );
    }
    $saved = query("SELECT square_request FROM orders WHERE id=?", [
        $retry["id"],
    ])->fetchColumn();
    checkout($retry);
    check(
        json_decode($saved, true)["idempotency_key"] ===
            "teebanj-" . $retry["id"],
        "retry reuses persisted idempotency key",
    );
    query("DELETE FROM order_items WHERE order_id=?", [$retry["id"]]);
    query("DELETE FROM orders WHERE id=?", [$retry["id"]]);
} finally {
    query("DELETE FROM order_items WHERE order_id=?", [$id]);
    query("DELETE FROM orders WHERE id=?", [$id]);
    query("DELETE FROM products WHERE id='TESTVAR'");
}
