<?php
require dirname(__DIR__) . "/api/bootstrap.php";
require dirname(__DIR__) . "/api/commerce.php";
function check(bool $ok, string $message): void
{
    if (!$ok) {
        throw new RuntimeException($message);
    }
    echo "PASS: $message\n";
}
check(
    normalize_items([
        ["id" => "V1", "qty" => 1],
        ["id" => "V1", "qty" => 1],
    ]) === ["V1" => 2],
    "duplicate variations aggregate to quantity two",
);
foreach ([0, -1, 1.5, "2", 100] as $qty) {
    try {
        normalize_items([["id" => "V1", "qty" => $qty]]);
        throw new RuntimeException("Invalid quantity accepted");
    } catch (InvalidArgumentException $e) {
        echo "PASS: rejects invalid quantity " . json_encode($qty) . "\n";
    }
}
$raw = '{"event_id":"example"}';
$url = "https://example.test/api";
$key = "unit-test-key";
$sig = base64_encode(hash_hmac("sha256", $url . $raw, $key, true));
check(valid_signature($raw, $sig, $url, $key), "valid Square signature");
check(
    !valid_signature($raw . " ", $sig, $url, $key),
    "rejects changed webhook body",
);
check(
    !valid_signature($raw, $sig, $url . "?other=1", $key),
    "rejects changed webhook URL",
);
check(!valid_signature($raw, $sig, $url, ""), "rejects missing webhook key");
$order = build_square_order(
    str_repeat("a", 32),
    [["id" => "V1", "price_cents" => 7000]],
    ["V1" => 2],
    [
        "shipping_cents" => 1500,
        "tax_percent" => "15",
        "shipping_taxable" => true,
    ],
);
check(
    $order["line_items"][0]["catalog_object_id"] === "V1" &&
        $order["line_items"][0]["quantity"] === "2",
    "Square sale references correct variation and quantity",
);
check(
    $order["line_items"][0]["base_price_money"]["amount"] === 7000,
    "price comes from server catalogue",
);
check(
    count($order["line_items"]) === 2 &&
        isset($order["line_items"][1]["applied_taxes"]),
    "taxable shipping included",
);
$order = build_square_order(
    str_repeat("b", 32),
    [["id" => "V1", "price_cents" => 7000]],
    ["V1" => 2],
    ["shipping_cents" => 0, "tax_percent" => "0", "shipping_taxable" => false],
);
check(
    !isset($order["taxes"]) && count($order["line_items"]) === 1,
    "zero tax and shipping handled",
);
