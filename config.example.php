<?php
return [
    "base_url" => "https://teebanjfashionworld.ca",
    "db" => [
        "host" => "localhost",
        "port" => 3306,
        "name" => "cpanel_teebanj",
        "user" => "cpanel_user",
        "password" => "",
    ],
    "admin_email" => "info@teebanjfashionworld.ca",
    "admin_password_hash" => "", // Generate with: php tools/password.php
    "checkout_enabled" => false,
    "square" => [
        "environment" => "sandbox", // sandbox or production
        "access_token" => "",
        "location_id" => "",
        "version" => "2026-09-16",
        "webhook_signature_key" => "",
        "webhook_url" =>
            "https://teebanjfashionworld.ca/api/index.php?action=webhook",
    ],
    // CAD cents. Only configured provinces can check out. Confirm rates before enabling.
    // Example structure: 'NB'=>['shipping_cents'=>1500,'tax_percent'=>'15','shipping_taxable'=>true]
    "delivery" => [],
];
