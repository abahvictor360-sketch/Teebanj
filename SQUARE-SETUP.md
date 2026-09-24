# Square setup

## 1. Account and developer application
Use a Canadian Square account for CAD sales. Sign in at https://developer.squareup.com/apps and create an application for Teebanj Fashion World.
Start in Sandbox. Create/select a sandbox seller and location. Put the sandbox token and location ID in config.local.php. Tokens belong only on the PHP server.
This implementation connects your own store with a server-side token; it does not implement multi-merchant OAuth onboarding.

## 2. Create the catalogue
Create categories Women, Men, Fabrics and Accessories in Square's item library.
Use the existing website for names, photos, descriptions and prices, verifying current prices before selling.
For each item:
1. Add name, description, category and photo.
2. Set a fixed CAD price.
3. Add a separate variation for every size/colour combination.
4. Assign each variation a unique SKU.
5. Make it available at the configured location.
6. Enable inventory tracking at that location.
7. Count your actual stock and enter that opening quantity.

Example: Medium/Blue and Large/Blue must be separate variations. Enter 50 only where you actually have 50 units. The website sells each variation exactly as named in Square.

## 3. Import
Sign in at admin.html and click Import / refresh Square catalogue.
This reads Square into MySQL; it does not create Square products or change opening stock.
Only fixed-price CAD variations with inventory tracking and location availability are imported. Deleted/missing products are deactivated locally. Square products replace enquiry-only previews.
Check variation names, prices, photos and counts.

## 4. Webhooks
In your developer application create a subscription for:
    https://YOUR-DOMAIN/api/index.php?action=webhook

Subscribe to payment.created, payment.updated, inventory.count.updated and refund.updated.
Copy its signature key to square.webhook_signature_key. Set square.webhook_url to exactly the subscribed URL, including the query string.
Use separate sandbox and production keys. The integration pins API version 2026-09-16; configure your subscription consistently.

Callbacks are signature-checked; payment/order data is also retrieved from Square and validated for identity, currency, total, location and variations.

## 5. Delivery
Configure your Canadian province delivery rules before enabling checkout. Buyers review the final total on Square.
The delivery address entered on this website is the fulfilment address displayed to the administrator. Square does not collect a replacement shipping address, avoiding destination changes after tax/shipping calculation.

## 6. Acceptance test: 50 → 48
1. Create a sandbox variation with stock 50 at the configured location; enable inventory tracking.
2. Import it into the website.
3. Configure a test delivery rule and enable staging checkout.
4. Add quantity 2 of that variation.
5. Enter delivery details and open Square Sandbox checkout.
6. Complete payment using Square's documented sandbox details.
7. Confirm the local order becomes paid.
8. Confirm Square and the refreshed website show stock 48.
9. Redeliver the payment webhook. Stock must remain 48.
10. Test a failed payment and a quantity above stock.
11. Test an in-store Square sale; confirm stock updates through the webhook or next sync.
12. Test a refund. The local order is flagged for review; choose any return-to-stock action in Square.

Square performs the paid-order deduction. Do not also call an inventory adjustment endpoint for that sale.

## 7. Production
Replace sandbox token/location/webhooks with production values and re-import. Sandbox IDs cannot be used for production.
Verify actual inventory, delivery/tax settings and final HTTPS URLs.
Adding to a bag does not reserve stock. The stock pre-check cannot eliminate races against simultaneous sales on another channel. Handle exceptional oversold orders through Square.

## Official references
https://developer.squareup.com/docs/checkout-api/square-order-checkout
https://developer.squareup.com/docs/inventory-api/how-it-works
https://developer.squareup.com/docs/checkout-api/common-pitfalls
https://developer.squareup.com/docs/webhooks/step3validate
https://developer.squareup.com/docs/devtools/sandbox/overview
