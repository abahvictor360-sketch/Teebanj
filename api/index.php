<?php
declare(strict_types=1);
require __DIR__ . "/bootstrap.php";
require __DIR__ . "/commerce.php";
try {
    $action = $_GET["action"] ?? "session";
    if ($action === "webhook") {
        if (($_SERVER["REQUEST_METHOD"] ?? "") !== "POST") {
            fail("Use POST.", 405);
        }
        $raw = file_get_contents("php://input", false, null, 0, 1048577);
        if (strlen($raw) > 1048576) {
            fail("Too large.", 413);
        }
        $c = config()["square"];
        if (
            !valid_signature(
                $raw,
                $_SERVER["HTTP_X_SQUARE_HMACSHA256_SIGNATURE"] ?? "",
                $c["webhook_url"],
                $c["webhook_signature_key"],
            )
        ) {
            fail("Invalid signature.", 403);
        }
        $event = json_decode($raw, true, 128, JSON_THROW_ON_ERROR);
        $id = $event["event_id"] ?? "";
        if (!is_string($id) || $id === "" || strlen($id) > 192) {
            fail("Invalid event.");
        }
        if (query("SELECT id FROM webhook_events WHERE id=?", [$id])->fetch()) {
            respond(["ok" => true]);
        }
        if (
            in_array(
                $event["type"] ?? "",
                ["payment.created", "payment.updated"],
                true,
            )
        ) {
            $pid = $event["data"]["object"]["payment"]["id"] ?? "";
            if ($pid) {
                reconcile_payment($pid);
            }
        } elseif (($event["type"] ?? "") === "inventory.count.updated") {
            $ids = [];
            foreach (
                $event["data"]["object"]["inventory_counts"] ?? []
                as $count
            ) {
                if (($count["location_id"] ?? "") === $c["location_id"]) {
                    $ids[] = $count["catalog_object_id"];
                }
            }
            if ($ids) {
                foreach (inventory($ids) as $pid => $qty) {
                    query("UPDATE products SET stock=? WHERE id=?", [
                        $qty,
                        $pid,
                    ]);
                };
            }
        } elseif (($event["type"] ?? "") === "refund.updated") {
            $rid = $event["data"]["object"]["refund"]["id"] ?? "";
            if ($rid) {
                $r = square("GET", "/refunds/" . rawurlencode($rid))["refund"];
                if (($r["status"] ?? "") === "COMPLETED") {
                    query(
                        "UPDATE orders SET status='refund_review' WHERE payment_id=?",
                        [$r["payment_id"]],
                    );
                }
            }
        }
        // Record only after success. A failed callback receives 503 so Square can retry.
        query("INSERT IGNORE INTO webhook_events(id) VALUES(?)", [$id]);
        respond(["ok" => true]);
    }
    start_session();
    if ($action === "session") {
        respond([
            "csrf" => $_SESSION["csrf"],
            "customer" => isset($_SESSION["customer_id"])
                ? query("SELECT id,name,email FROM customers WHERE id=?", [
                    $_SESSION["customer_id"],
                ])->fetch()
                : null,
            "admin" => !empty($_SESSION["admin"]),
            "checkout_enabled" => config()["checkout_enabled"],
            "provinces" => array_keys(config()["delivery"]),
        ]);
    }
    if ($action === "catalog") {
        respond([
            "products" => query(
                "SELECT * FROM products WHERE active=1 ORDER BY name,variation_name",
            )->fetchAll(),
        ]);
    }
    if ($action === "my-orders") {
        if (empty($_SESSION["customer_id"])) {
            fail("Sign in to see orders.", 401);
        }
        respond([
            "orders" => array_map(
                "public_order",
                query(
                    "SELECT * FROM orders WHERE customer_id=? ORDER BY created_at DESC LIMIT 100",
                    [$_SESSION["customer_id"]],
                )->fetchAll(),
            ),
        ]);
    }
    if ($action === "order") {
        $id = $_GET["ref"] ?? "";
        $o = query("SELECT * FROM orders WHERE id=?", [$id])->fetch();
        if (
            !$o ||
            (!hash_equals(
                $o["session_owner"],
                hash("sha256", $_SESSION["owner"]),
            ) &&
                (empty($_SESSION["customer_id"]) ||
                    (int) $o["customer_id"] !==
                        (int) $_SESSION["customer_id"]) &&
                empty($_SESSION["admin"]))
        ) {
            fail(
                "Order not found. Use the browser you checked out with, or sign in to your account.",
                404,
            );
        }
        if (
            $o["status"] === "pending" &&
            time() - ($_SESSION["last_refresh"][$id] ?? 0) > 10
        ) {
            $_SESSION["last_refresh"][$id] = time();
            refresh_order($o);
            $o = query("SELECT * FROM orders WHERE id=?", [$id])->fetch();
        }
        respond(["order" => public_order($o)]);
    }
    if ($action === "admin-data") {
        admin();
        respond([
            "orders" => array_map(function ($o) {
                $o["items"] = query(
                    "SELECT name,quantity,price_cents FROM order_items WHERE order_id=?",
                    [$o["id"]],
                )->fetchAll();
                return $o;
            }, query(
                "SELECT id,status,total_cents,customer_json,tracking,created_at FROM orders ORDER BY created_at DESC LIMIT 200",
            )->fetchAll()),
            "products" => query(
                "SELECT * FROM products ORDER BY name LIMIT 1000",
            )->fetchAll(),
            "messages" => query(
                "SELECT * FROM messages ORDER BY created_at DESC LIMIT 100",
            )->fetchAll(),
            "subscribers" => query(
                "SELECT * FROM subscribers ORDER BY consent_at DESC LIMIT 200",
            )->fetchAll(),
        ]);
    }
    $data = input();
    if (
        $action === "login" ||
        $action === "register" ||
        $action === "admin-login"
    ) {
        throttle("authentication", 15);
        $mail = email($data);
        $password = field($data, "password", 72);
        if ($action === "admin-login") {
            if (
                !hash_equals(strtolower(config()["admin_email"]), $mail) ||
                !password_verify($password, config()["admin_password_hash"])
            ) {
                fail("Invalid email or password.", 401);
            }
            session_regenerate_id(true);
            $_SESSION["admin"] = true;
            respond(["ok" => true]);
        }
        if ($action === "register") {
            if (strlen($password) < 12) {
                fail("Use a password with at least 12 characters.");
            }
            $name = field($data, "name", 120);
            try {
                query(
                    "INSERT INTO customers(name,email,password_hash) VALUES(?,?,?)",
                    [$name, $mail, password_hash($password, PASSWORD_DEFAULT)],
                );
            } catch (PDOException $e) {
                if ($e->getCode() === "23000") {
                    fail("Account cannot be created. Try signing in.", 409);
                }
                throw $e;
            }
            $_SESSION["customer_id"] = (int) db()->lastInsertId();
        } else {
            $u = query("SELECT * FROM customers WHERE email=?", [
                $mail,
            ])->fetch();
            if (!$u || !password_verify($password, $u["password_hash"])) {
                fail("Invalid email or password.", 401);
            }
            $_SESSION["customer_id"] = (int) $u["id"];
        }
        session_regenerate_id(true);
        respond(["ok" => true]);
    }
    if ($action === "logout") {
        $_SESSION = [];
        session_destroy();
        respond(["ok" => true]);
    }
    if ($action === "checkout") {
        throttle("checkout", 30);
        respond(checkout($data));
    }
    if ($action === "contact") {
        throttle("contact", 10);
        query(
            "INSERT INTO messages(name,email,subject,message) VALUES(?,?,?,?)",
            [
                field($data, "name", 120),
                email($data),
                field($data, "subject", 200),
                field($data, "message", 5000),
            ],
        );
        respond(["ok" => true]);
    }
    if ($action === "subscribe") {
        throttle("subscribe", 10);
        if (($data["consent"] ?? false) !== true) {
            fail("Consent is required.");
        }
        query("INSERT IGNORE INTO subscribers(email) VALUES(?)", [
            email($data),
        ]);
        respond(["ok" => true]);
    }
    if ($action === "admin-sync") {
        admin();
        respond(["count" => sync_catalog()]);
    }
    if ($action === "admin-refresh") {
        admin();
        $o = query("SELECT * FROM orders WHERE id=?", [
            field($data, "id", 32),
        ])->fetch();
        if (!$o) {
            fail("Order not found.", 404);
        }
        refresh_order($o);
        respond(["ok" => true]);
    }
    if ($action === "admin-tracking") {
        admin();
        $id = field($data, "id", 32);
        $tracking = field($data, "tracking", 500);
        $o = query("SELECT status FROM orders WHERE id=?", [$id])->fetch();
        if (!$o || !in_array($o["status"], ["paid", "shipped"], true)) {
            fail("Only paid orders can be marked shipped.", 409);
        }
        query("UPDATE orders SET tracking=?,status='shipped' WHERE id=?", [
            $tracking,
            $id,
        ]);
        respond(["ok" => true]);
    }
    fail("Unknown endpoint.", 404);
} catch (Throwable $e) {
    error_log("Teebanj: " . get_class($e) . ": " . $e->getMessage());
    respond(
        [
            "error" =>
                "The store service is temporarily unavailable. Please retry. Your bag has been kept.",
        ],
        503,
    );
}
