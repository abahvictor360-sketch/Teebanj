# Teebanj Fashion World

PHP 8.2+ storefront and MySQL database for cPanel with Square-hosted checkout and inventory synchronisation. Rebranded for Teebanj Fashion World, Moncton, Canada. Prices are CAD.

## Installation
Read CPANEL-SETUP.md, then SQUARE-SETUP.md. Import database/schema.sql into your selected database. Optionally import database/preview.sql for the 20 enquiry-only product previews. Copy config.example.php to config.local.php and configure your own credentials.

A SQL import alone cannot connect payments: MySQL credentials, Square token/location, webhook settings, delivery/tax rules and an administrator password hash are required.

## Features
- Responsive catalogue, product details, cart and wishlist.
- Square product variations stored in MySQL; server-side price and availability validation.
- Customer registration/sign-in and account order history.
- Guest checkout or account-linked orders through one-time Square payment links.
- Persisted checkout requests and idempotency keys for retry safety.
- Signed webhooks and independent payment verification.
- Protected admin dashboard: product import, order line items, delivery details, tracking, contact messages and subscribers.
- Inventory refresh following Square sales; completed refunds flagged for review.
- CLI catalogue sync and payment reconciliation.

## Inventory
Square performs the sale adjustment for an itemized, paid order. The website reads back the resulting stock. Buying 2 from 50 results in 48, with no second manual deduction.

The initial stock check does not reserve stock during hosted checkout. Concurrent in-store/online purchases can race. Review low-stock exceptions and refunds in Square.

## Scope and launch dependencies
- Public website previews deliberately have zero sellable stock. Square import replaces them.
- Products and inventory are managed in Square. Only fixed-price, tracked CAD variations at the configured location are imported.
- Delivery rules support Canadian provinces/territories. International, weight-based shipping and carrier labels are not implemented.
- Contact/newsletter data is stored, not emailed. Tracking is entered manually. Email marketing, order emails and password-reset emails are not implemented.
- Guest status requires the original session/browser; account orders require the original account.
- Refunds/cancellations and any restocking decision are handled in Square. Refund callbacks flag orders for review.
- Existing WordPress customers and historical orders are not migrated.
- No real merchant account was connected or charged during development.

## Verification
Local tests used PHP 8.2.12 and an isolated XAMPP MariaDB 10.4 database. Target schema is compatible with MySQL 8+ / MariaDB 10.4+.

tests/unit.php checks quantity validation, HMAC signatures and order construction.
tests/commerce-integration.php uses the real local database with a deterministic Square double to check retries, failed payments, tampered amounts, stock validation and 50 → 48 reconciliation.
tests/http-integration.cjs checks real PHP routes, CSRF, accounts, protected admin access, form persistence and checkout gating.
Browser checks cover desktop/mobile layout and navigation.

A real Square Sandbox payment and webhook delivery remain required before launch. The release ZIP excludes development configuration, tests and Git history.

## Sources
Brand: https://teebanjfashionworld.ca/about-us/
Contact: https://teebanjfashionworld.ca/contact-us/
Products/photos: public WooCommerce Store API at teebanjfashionworld.ca, retrieved 2026-09-24.
Square: https://developer.squareup.com/docs/checkout-api/square-order-checkout
Inventory: https://developer.squareup.com/docs/inventory-api/how-it-works
Webhooks: https://developer.squareup.com/docs/webhooks/step3validate
