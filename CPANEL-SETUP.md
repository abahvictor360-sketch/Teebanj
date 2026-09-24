# cPanel installation

## 1. Staging and PHP
Use a staging subdomain first. Back up the existing WordPress website/database before replacing files. Select PHP 8.2+ with PDO MySQL, cURL, JSON and OpenSSL. Enable HTTPS/AutoSSL and outbound HTTPS access to Square.

## 2. Upload
Upload and extract Teebanj-Fashion-World-cPanel.zip into the staging document root. index.html, api/, assets/, css/ and js/ must be directly inside that root.
Keep all .htaccess files, including those in api/, database/ and tools/. Enable hidden-file display in File Manager.

## 3. MySQL
Use cPanel MySQL Database Wizard to create a database and user; assign the user to that database with the necessary table privileges. Note the full cPanel-prefixed database and user names.
In phpMyAdmin select your database and import database/schema.sql. The SQL contains no hard-coded database name.
Optionally import database/preview.sql to show your existing website's 20 public product previews. These cannot be purchased until Square products are imported.

## 4. Configuration
Copy config.example.php to config.local.php. Set:
- base_url: exact HTTPS URL, including any subdirectory, with no trailing slash.
- db: host, port (usually 3306), database, username and password.
- admin_email and admin_password_hash.
- square: environment, token, location ID, exact webhook URL and signature key.
- delivery: province codes with shipping_cents, tax_percent and shipping_taxable.

Shipping of CAD 15 is 1500 cents. The commented delivery example illustrates structure only; confirm your actual rates before enabling payments.
Keep checkout_enabled false until testing is complete.

Generate an administrator password hash using cPanel Terminal:
    php tools/password.php

Enter a unique password of 12–72 bytes, then paste the resulting hash into admin_password_hash. The script is blocked from the web. Without cPanel Terminal, run it using PHP on your computer or ask the hosting provider.
Restrict config.local.php permissions as supported by the host (commonly 600/640). Never commit or share credentials.

## 5. Verify
Visit admin.html and sign in. Import the Square catalogue after completing SQUARE-SETUP.md.
Check prices, variations, counts, contact form persistence and customer accounts.
These URLs must be denied:
- /config.local.php
- /database/schema.sql
- /api/bootstrap.php
- /tools/password.php
- /.git/config (never upload .git)

## 6. Cron
Use the PHP path supplied by your host and the actual document-root path.

Every 15 minutes:
    /usr/local/bin/php /home/CPANEL_USER/public_html/tools/sync.php

Every 5 minutes:
    /usr/local/bin/php /home/CPANEL_USER/public_html/tools/reconcile.php

Catalogue sync refreshes products/stock. Signed inventory webhooks update stock sooner. Reconciliation helps recover missed payment callbacks.

## 7. Launch
After sandbox testing, use production Square credentials/location/webhooks and re-import the production catalogue. IDs differ between environments. Clear any old test bag.
Set the final base_url and webhook URL, confirm real delivery/tax rules and business policies, then enable checkout.
Run a deliberate production verification before announcing launch.

## Troubleshooting
Service unavailable: inspect PHP logs, database details and required extensions.
No imported products: verify CAD, fixed pricing, inventory tracking and location availability.
Unchanged stock: verify completed payment, exact variation/location and callbacks; do not add a second sale deduction.
Invalid webhook signature: the URL must match exactly, including ?action=webhook.
Missing photos: upload assets/products/; Square-imported photos use Square URLs.
