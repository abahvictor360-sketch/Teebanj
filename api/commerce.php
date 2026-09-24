<?php
declare(strict_types=1);
function inventory(array $ids): array
{
    $counts = [];
    $cursor = null;
    foreach (array_chunk(array_values(array_unique($ids)), 100) as $chunk) {
        do {
            $body = [
                "catalog_object_ids" => $chunk,
                "location_ids" => [config()["square"]["location_id"]],
                "states" => ["IN_STOCK"],
            ];
            if ($cursor) {
                $body["cursor"] = $cursor;
            }
            $r = square("POST", "/inventory/counts/batch-retrieve", $body);
            foreach ($r["counts"] ?? [] as $c) {
                $counts[$c["catalog_object_id"]] = (float) $c["quantity"];
            }
            $cursor = $r["cursor"] ?? null;
        } while ($cursor);
    }
    return $counts;
}
function sync_catalog(): int
{
    // Stage the complete remote snapshot before altering live rows.
    $objects = [];
    $cursor = null;
    do {
        $r = square(
            "GET",
            "/catalog/list?types=ITEM,IMAGE,CATEGORY" .
                ($cursor ? "&cursor=" . rawurlencode($cursor) : ""),
        );
        foreach ($r["objects"] ?? [] as $o) {
            $objects[$o["id"]] = $o;
        }
        $cursor = $r["cursor"] ?? null;
    } while ($cursor);
    $rows = [];
    $loc = config()["square"]["location_id"];
    foreach ($objects as $o) {
        if ($o["type"] !== "ITEM" || !empty($o["is_deleted"])) {
            continue;
        }
        $present =
            $o["present_at_all_locations"] ?? false
                ? !in_array($loc, $o["absent_at_location_ids"] ?? [], true)
                : in_array($loc, $o["present_at_location_ids"] ?? [], true);
        if (!$present) {
            continue;
        }
        $item = $o["item_data"];
        $image =
            $objects[$item["image_ids"][0] ?? ""]["image_data"]["url"] ?? "";
        if (!str_starts_with($image, "https://")) {
            $image = "";
        }
        $categoryName = "";
        foreach ($item["categories"] ?? [] as $cat) {
            $categoryName .=
                " " . ($objects[$cat["id"]]["category_data"]["name"] ?? "");
        }
        $categoryName = strtolower($categoryName);
        $category = str_contains($categoryName, "women")
            ? "women"
            : (str_contains($categoryName, "men")
                ? "men"
                : (preg_match("/accessor|bag|shoe|gele/", $categoryName)
                    ? "accessories"
                    : "fabrics"));
        foreach ($item["variations"] ?? [] as $v) {
            $d = $v["item_variation_data"];
            $price = $d["price_money"] ?? [];
            if (
                !empty($v["is_deleted"]) ||
                ($d["pricing_type"] ?? "") !== "FIXED_PRICING" ||
                ($price["currency"] ?? "") !== "CAD"
            ) {
                continue;
            }
            $vp =
                $v["present_at_all_locations"] ?? true
                    ? !in_array($loc, $v["absent_at_location_ids"] ?? [], true)
                    : in_array($loc, $v["present_at_location_ids"] ?? [], true);
            if (!$vp) {
                continue;
            }
            $tracked = $d["track_inventory"] ?? false;
            $soldOut = false;
            foreach ($d["location_overrides"] ?? [] as $override) {
                if (($override["location_id"] ?? "") === $loc) {
                    $tracked = $override["track_inventory"] ?? $tracked;
                    $price = $override["price_money"] ?? $price;
                    $soldOut = $override["sold_out"] ?? false;
                }
            }
            if (
                !$tracked ||
                ($price["currency"] ?? "") !== "CAD" ||
                ($price["amount"] ?? 0) <= 0
            ) {
                continue;
            }
            $rows[] = [
                $v["id"],
                $o["id"],
                $item["name"],
                strip_tags(
                    $item["description_plaintext"] ??
                        ($item["description"] ?? ""),
                ),
                $category,
                $d["name"] ?? "Default",
                $d["sku"] ?? "",
                (int) $price["amount"],
                $image,
                $soldOut,
            ];
        }
    }
    $stock = $rows ? inventory(array_column($rows, 0)) : [];
    db()->beginTransaction();
    try {
        query("UPDATE products SET active=0");
        foreach ($rows as $row) {
            $soldOut = array_pop($row);
            $row[] = $soldOut ? 0 : $stock[$row[0]] ?? 0;
            query(
                "INSERT INTO products(id,square_item_id,name,description,category,variation_name,sku,price_cents,image_url,stock) VALUES(?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE square_item_id=VALUES(square_item_id),name=VALUES(name),description=VALUES(description),category=VALUES(category),variation_name=VALUES(variation_name),sku=VALUES(sku),price_cents=VALUES(price_cents),image_url=VALUES(image_url),stock=VALUES(stock),active=1",
                $row,
            );
        }
        db()->commit();
    } catch (Throwable $e) {
        db()->rollBack();
        throw $e;
    }
    return count($rows);
}
function normalize_items(mixed $items): array
{
    if (
        !is_array($items) ||
        !array_is_list($items) ||
        count($items) < 1 ||
        count($items) > 50
    ) {
        throw new InvalidArgumentException("Add between 1 and 50 items.");
    }
    $normalized = [];
    foreach ($items as $line) {
        if (
            !is_array($line) ||
            !is_string($line["id"] ?? null) ||
            !preg_match('/^[A-Za-z0-9_-]{1,192}$/', $line["id"]) ||
            !is_int($line["qty"] ?? null) ||
            $line["qty"] < 1 ||
            $line["qty"] > 99
        ) {
            throw new InvalidArgumentException("Invalid item or quantity.");
        }
        $normalized[$line["id"]] =
            ($normalized[$line["id"]] ?? 0) + $line["qty"];
        if ($normalized[$line["id"]] > 99) {
            throw new InvalidArgumentException("Maximum 99 per variation.");
        }
    }
    ksort($normalized);
    return $normalized;
}
function delivery_rule(string $province): array
{
    $rule = config()["delivery"][$province] ?? null;
    if (
        !$rule ||
        !is_int($rule["shipping_cents"] ?? null) ||
        $rule["shipping_cents"] < 0 ||
        !is_numeric($rule["tax_percent"] ?? null) ||
        (float) $rule["tax_percent"] < 0 ||
        (float) $rule["tax_percent"] > 100 ||
        !is_bool($rule["shipping_taxable"] ?? null)
    ) {
        throw new InvalidArgumentException(
            "Shipping is not available for this province. Contact us for a quote.",
        );
    }
    return $rule;
}
function build_square_order(
    string $id,
    array $rows,
    array $quantities,
    array $rule,
): array {
    $lines = [];
    $tax = (float) $rule["tax_percent"] > 0;
    foreach ($rows as $p) {
        $line = [
            "catalog_object_id" => $p["id"],
            "quantity" => (string) $quantities[$p["id"]],
            "base_price_money" => [
                "amount" => (int) $p["price_cents"],
                "currency" => "CAD",
            ],
        ];
        if ($tax) {
            $line["applied_taxes"] = [["tax_uid" => "delivery-tax"]];
        }
        $lines[] = $line;
    }
    if ($rule["shipping_cents"] > 0) {
        $shipping = [
            "name" => "Shipping",
            "quantity" => "1",
            "base_price_money" => [
                "amount" => $rule["shipping_cents"],
                "currency" => "CAD",
            ],
        ];
        if ($tax && $rule["shipping_taxable"]) {
            $shipping["applied_taxes"] = [["tax_uid" => "delivery-tax"]];
        }
        $lines[] = $shipping;
    }
    $order = [
        "location_id" => config()["square"]["location_id"],
        "reference_id" => $id,
        "line_items" => $lines,
    ];
    if ($tax) {
        $order["taxes"] = [
            [
                "uid" => "delivery-tax",
                "name" => "Sales tax",
                "percentage" => (string) $rule["tax_percent"],
                "scope" => "LINE_ITEM",
                "type" => "ADDITIVE",
            ],
        ];
    }
    return $order;
}
function checkout(array $data): array
{
    if (!config()["checkout_enabled"]) {
        fail("Online checkout is not open yet. Please contact us.", 503);
    }
    $id = field($data, "id", 32);
    if (!preg_match('/^[a-f0-9]{32}$/', $id)) {
        fail("Invalid checkout reference.");
    }
    try {
        $items = normalize_items($data["items"] ?? null);
    } catch (InvalidArgumentException $e) {
        fail($e->getMessage());
    }
    $c = $data["customer"] ?? [];
    if (!is_array($c)) {
        fail("Check your delivery details.");
    }
    $customer = [
        "name" => field($c, "name", 120),
        "email" => email($c),
        "phone" => field($c, "phone", 40),
        "address" => field($c, "address", 200),
        "city" => field($c, "city", 100),
        "province" => field($c, "province", 2),
        "postal" => strtoupper(field($c, "postal", 10)),
        "country" => "CA",
    ];
    if (!preg_match('/^[A-Z]\d[A-Z] ?\d[A-Z]\d$/', $customer["postal"])) {
        fail("Enter a Canadian postal code.");
    }
    $hash = hash(
        "sha256",
        json_encode([$items, $customer], JSON_THROW_ON_ERROR),
    );
    $owner = hash("sha256", $_SESSION["owner"]);
    // Per-session serialization prevents duplicate clicks. Stable ID + persisted request recover network failures.
    $existing = query("SELECT * FROM orders WHERE id=?", [$id])->fetch();
    if ($existing) {
        if (
            !hash_equals($existing["session_owner"], $owner) ||
            !hash_equals($existing["request_hash"], $hash)
        ) {
            fail(
                "Start a new checkout for the changed bag or delivery details.",
                409,
            );
        }
        if ($existing["checkout_url"]) {
            return ["id" => $id, "url" => $existing["checkout_url"]];
        }
        $request = json_decode(
            $existing["square_request"],
            true,
            128,
            JSON_THROW_ON_ERROR,
        );
    } else {
        try {
            $rule = delivery_rule($customer["province"]);
        } catch (InvalidArgumentException $e) {
            fail($e->getMessage());
        }
        $rows = [];
        $stock = inventory(array_keys($items));
        $catalog = square("POST", "/catalog/batch-retrieve", [
            "object_ids" => array_keys($items),
        ]);
        $currentById = [];
        foreach ($catalog["objects"] ?? [] as $object) {
            $currentById[$object["id"]] = $object;
        }
        foreach ($items as $pid => $qty) {
            $p = query("SELECT * FROM products WHERE id=? AND active=1", [
                $pid,
            ])->fetch();
            if (!$p || ($stock[$pid] ?? 0) < $qty) {
                fail(
                    "An item is unavailable or has insufficient stock. Please update your bag.",
                    409,
                );
            }
            // Check the current variation price/tracking, not a browser price or stale catalogue snapshot.
            $current = ["object" => $currentById[$pid] ?? []];
            if (
                !empty($current["object"]["is_deleted"]) ||
                in_array(
                    config()["square"]["location_id"],
                    $current["object"]["absent_at_location_ids"] ?? [],
                    true,
                )
            ) {
                fail("This product is unavailable at the store location.", 409);
            }
            $d = $current["object"]["item_variation_data"] ?? [];
            $price = $d["price_money"] ?? [];
            $track = $d["track_inventory"] ?? false;
            $sold = false;
            foreach ($d["location_overrides"] ?? [] as $ov) {
                if (
                    ($ov["location_id"] ?? "") ===
                    config()["square"]["location_id"]
                ) {
                    $price = $ov["price_money"] ?? $price;
                    $track = $ov["track_inventory"] ?? $track;
                    $sold = $ov["sold_out"] ?? false;
                }
            }
            if (
                !$track ||
                $sold ||
                ($price["currency"] ?? "") !== "CAD" ||
                (int) ($price["amount"] ?? -1) !== (int) $p["price_cents"]
            ) {
                fail(
                    "This item changed in Square. Contact the store to refresh its catalogue.",
                    409,
                );
            }
            $rows[] = $p;
        }
        $request = [
            "idempotency_key" => "teebanj-" . $id,
            "order" => build_square_order($id, $rows, $items, $rule),
            "checkout_options" => [
                "redirect_url" =>
                    config()["base_url"] . "/order.html?ref=" . $id,
                "ask_for_shipping_address" => false,
                "allow_tipping" => false,
            ],
            "pre_populated_data" => [
                "buyer_email" => $customer["email"],
                "buyer_address" => [
                    "address_line_1" => $customer["address"],
                    "locality" => $customer["city"],
                    "administrative_district_level_1" => $customer["province"],
                    "postal_code" => $customer["postal"],
                    "country" => "CA",
                ],
            ],
        ];
        db()->beginTransaction();
        try {
            query(
                "INSERT INTO orders(id,session_owner,customer_id,request_hash,customer_json,square_request) VALUES(?,?,?,?,?,?)",
                [
                    $id,
                    $owner,
                    $_SESSION["customer_id"] ?? null,
                    $hash,
                    json_encode($customer),
                    json_encode($request),
                ],
            );
            foreach ($rows as $p) {
                query(
                    "INSERT INTO order_items(order_id,product_id,name,quantity,price_cents) VALUES(?,?,?,?,?)",
                    [
                        $id,
                        $p["id"],
                        $p["name"] . " — " . $p["variation_name"],
                        $items[$p["id"]],
                        $p["price_cents"],
                    ],
                );
            }
            db()->commit();
        } catch (Throwable $e) {
            db()->rollBack();
            throw $e;
        }
    }
    $result = square("POST", "/online-checkout/payment-links", $request);
    $link = $result["payment_link"] ?? null;
    if (!$link || empty($link["order_id"]) || empty($link["url"])) {
        throw new RuntimeException("Square did not return a checkout link.");
    }
    $so = square("GET", "/orders/" . rawurlencode($link["order_id"]))["order"];
    query(
        "UPDATE orders SET square_order_id=?,payment_link_id=?,checkout_url=?,total_cents=? WHERE id=?",
        [
            $link["order_id"],
            $link["id"],
            $link["url"],
            $so["total_money"]["amount"],
            $id,
        ],
    );
    return ["id" => $id, "url" => $link["url"]];
}
function reconcile_payment(string $paymentId): void
{
    $p = square("GET", "/payments/" . rawurlencode($paymentId))["payment"];
    if (
        ($p["status"] ?? "") !== "COMPLETED" ||
        ($p["location_id"] ?? "") !== config()["square"]["location_id"] ||
        empty($p["order_id"])
    ) {
        return;
    }
    $so = square("GET", "/orders/" . rawurlencode($p["order_id"]))["order"];
    $id = $so["reference_id"] ?? "";
    if (!preg_match('/^[a-f0-9]{32}$/', $id)) {
        return;
    }
    $local = query("SELECT * FROM orders WHERE id=?", [$id])->fetch();
    if (!$local) {
        return;
    }
    // Verify exact variation quantities, amount, currency and location against the persisted checkout.
    $expected = query(
        "SELECT product_id,quantity FROM order_items WHERE order_id=? ORDER BY product_id",
        [$id],
    )->fetchAll();
    $actual = [];
    foreach ($so["line_items"] ?? [] as $line) {
        if (isset($line["catalog_object_id"])) {
            $actual[$line["catalog_object_id"]] =
                ($actual[$line["catalog_object_id"]] ?? 0) +
                (int) $line["quantity"];
        }
    }
    ksort($actual);
    $wanted = [];
    foreach ($expected as $line) {
        $wanted[$line["product_id"]] = (int) $line["quantity"];
    }
    $total = $so["total_money"] ?? [];
    if (
        $actual !== $wanted ||
        ($total["currency"] ?? "") !== "CAD" ||
        ($p["amount_money"]["currency"] ?? "") !== "CAD" ||
        ($p["amount_money"]["amount"] ?? -1) !== ($total["amount"] ?? -2) ||
        ($so["location_id"] ?? "") !== config()["square"]["location_id"]
    ) {
        throw new RuntimeException("Payment does not match the local order.");
    }
    if (
        $local["total_cents"] !== null &&
        (int) $local["total_cents"] !== (int) $total["amount"]
    ) {
        throw new RuntimeException("Payment total mismatch.");
    }
    if (
        $local["square_order_id"] !== null &&
        $local["square_order_id"] !== $p["order_id"]
    ) {
        throw new RuntimeException("Square order mismatch.");
    }
    query(
        "UPDATE orders SET status=IF(status='pending','paid',status),square_order_id=?,payment_id=?,total_cents=?,receipt_url=? WHERE id=?",
        [
            $p["order_id"],
            $p["id"],
            $total["amount"],
            $p["receipt_url"] ?? null,
            $id,
        ],
    );
    // Square performs the sale adjustment. NEVER send a second IN_STOCK -> SOLD adjustment.
    $counts = inventory(array_keys($wanted));
    foreach ($wanted as $pid => $qty) {
        query("UPDATE products SET stock=? WHERE id=?", [
            $counts[$pid] ?? 0,
            $pid,
        ]);
    }
}
function refresh_order(array $order): void
{
    if (!$order["square_order_id"]) {
        return;
    }
    $so = square("GET", "/orders/" . rawurlencode($order["square_order_id"]))[
        "order"
    ];
    foreach ($so["tenders"] ?? [] as $t) {
        if (!empty($t["payment_id"])) {
            reconcile_payment($t["payment_id"]);
        }
    }
    if (($so["state"] ?? "") === "CANCELED") {
        query(
            "UPDATE orders SET status='cancelled' WHERE id=? AND status='pending'",
            [$order["id"]],
        );
    }
}
function public_order(array $o): array
{
    return [
        "id" => $o["id"],
        "status" => $o["status"],
        "total_cents" => $o["total_cents"],
        "tracking" => $o["tracking"],
        "created_at" => $o["created_at"],
    ];
}
