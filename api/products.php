<?php
declare(strict_types=1);
require __DIR__ . "/bootstrap.php";
header("Content-Type: application/javascript; charset=utf-8");
header("Cache-Control: no-store");
$rows = [];
$ready = true;
try {
    $rows = query(
        "SELECT * FROM products WHERE active=1 ORDER BY name,variation_name",
    )->fetchAll();
} catch (Throwable $e) {
    $ready = false;
    error_log("Teebanj catalogue unavailable: " . $e->getMessage());
}
$products = array_map(
    fn($p) => [
        "id" => $p["id"],
        "name" =>
            $p["name"] .
            ($p["variation_name"] === "Default" ||
            str_starts_with($p["id"], "preview-")
                ? ""
                : " — " . $p["variation_name"]),
        "cat" => $p["category"],
        "price" => (int) $p["price_cents"] / 100,
        "desc" => $p["description"],
        "image" => $p["image_url"],
        "variation" => $p["variation_name"],
        "preview" => str_starts_with($p["id"], "preview-"),
        "stock" => (float) $p["stock"],
        "colors" => ["#222222"],
        "rating" => 0,
        "reviews" => 0,
        "tags" => [],
    ],
    $rows,
);
echo "window.TEEBANJ_CATALOG = " .
    json_encode(
        $products,
        JSON_HEX_TAG |
            JSON_HEX_AMP |
            JSON_HEX_APOS |
            JSON_HEX_QUOT |
            JSON_THROW_ON_ERROR,
    ) .
    ";\n";
echo "window.TEEBANJ_READY = " . ($ready ? "true" : "false") . ";\n";
