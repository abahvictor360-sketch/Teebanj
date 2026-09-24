# Supabase alternative — Teebanj

The PHP/MySQL site remains at the repository root. The Supabase storefront source is in `supabase-site`; its static build is `supabase-site/dist`.

## Current implementation
- Project: cpqppfbhfteccorkjngj (Teebanj).
- Eight protected tables, with a server-only administrator role table.
- Store Edge Function deployed; it validates Auth tokens itself for private actions. Public catalog/contact routes work without login.
- 20 product previews imported from the existing site, stock zero. These are enquiry items, not sellable Square variations.
- Browser sign-in/sign-up uses Supabase Auth; account order history is ownership-filtered.
- Contact messages and newsletter consent are saved for administrators. No marketing or contact email is sent automatically.
- Admin dashboard reads products, messages, subscribers and orders. Tracking changes require a paid order.
- Square import, itemized checkout, payment reconciliation and signed webhooks are implemented. Checkout remains disabled until secrets and delivery settings are configured and a real Square Sandbox test passes.

## Build and preview
Run from `supabase-site`:
```powershell
npm ci
npm run build
npx serve dist -l 8088
node verify.mjs
node commerce.test.mjs
```
The browser configuration contains only the public project URL and publishable key.
Do not copy config.local.php, database credentials, or service-role keys into this directory.
The static build copies an explicit allowlist of storefront files.

## Vercel
Import the repository and set Root Directory to `supabase-site`.
Enable Vercel's option to include source files outside that root directory, because the build reuses ../assets, ../css, ../js and HTML.
The checked-in vercel.json sets the build command and dist output.
The static build is live at https://dist-psi-three-80.vercel.app. The Vercel project is `dist` in `abahvictor360-3017s-projects`; its Git root is configured to `supabase-site`. The Supabase alternative is on branch `codex/supabase-store` in draft PR #1. Main remains the PHP/MySQL version until that PR is merged.

## Account setup
In Supabase Authentication > URL Configuration, set Site URL to https://dist-psi-three-80.vercel.app.
Allow https://dist-psi-three-80.vercel.app/account.html for confirmation redirects (and http://localhost:8088/account.html during local testing). These Auth settings still need to be configured.
Keep email confirmation enabled; configure your own SMTP provider before public registration.
Create your account through the storefront and confirm its email.
Then use Supabase SQL Editor to promote only your account:
```sql
insert into public.store_admins(user_id)
select id from auth.users where lower(email) = lower('oasisorchardtech@gmail.com') and email_confirmed_at is not null
on conflict do nothing;
```
Current administrator: abahvictor760@gmail.com (confirmed, listed in store_admins, not yet signed in).
oasisorchardtech@gmail.com exists but is unconfirmed and is not an administrator. Promote it with the query above only after it confirms its email.
Never grant admin based on user-editable metadata. Sign in at admin.html with an administrator account.

## Database and deployments
Migrations in supabase/migrations match the remote applied migration versions.
supabase/seed.sql is optional preview content and never invents live stock.
The existing rls_auto_enable event trigger remains enabled; its client EXECUTE grants were revoked.
For another project, that helper may not exist: apply its revoke only if the helper exists.
Deploy the store function with JWT gateway verification disabled because its own handler validates bearer tokens and independently authorizes each private route. Do not remove those checks.

## Configure and verify Square
1. Create each product and size/colour variation in Square. Set CAD fixed prices and enable inventory tracking at your selected location. See SQUARE-SETUP.md.
2. Add the settings shown in supabase/secrets.example to Supabase Edge Function secrets. Use Sandbox credentials first. Supabase supplies its own service role; never put it in browser configuration.
3. Set PUBLIC_SITE_URL to the storefront origin. Configure DELIVERY_RULES_JSON with shipping in cents and your actual tax percentage for each supported province. These rates require your business configuration; no tax or shipping defaults are invented.
4. Register the exact SQUARE_WEBHOOK_URL in Square and subscribe to payment.created, payment.updated, refund.created, refund.updated and inventory.count.updated. Copy its signing key into secrets.
5. Sign in as the designated administrator and click Import / refresh Square catalogue. This atomically replaces visible previews with eligible tracked variations.
6. Set CHECKOUT_ENABLED=true only for your Sandbox testing initially. A buyer must sign in before checkout. Check a purchase of 2 from 50, webhook redelivery (still 48), refund review and simultaneous checkout attempts.
7. After successful testing, configure production credentials, production webhook signing key and production catalog. Keep checkout disabled while changing environments. Sandbox and production order histories should use separate Supabase projects.

The server checks live prices and stock, calculates the order through Square, and persists its exact request and items in one transaction. A retry reuses that request. Payments must match order ID, location, amount, currency and item quantities. Square performs the inventory deduction; our code only reads its resulting count.

Stock is checked before creating a link, but a payment link does not reserve stock. Concurrent buyers can still compete for the final units. Inventory webhook failures are retried by Square; administrators can refresh the catalog and check payment status manually. Large catalogs may exceed Edge Function time limits and need a background sync job.

No real Square credentials have been configured or real payments tested by this implementation. Automated tests use Square responses in memory.

## Verification performed
Static production build and browser homepage; live catalog/session and CORS; rejected invalid tokens, anonymous order/admin reads and private table access; disabled checkout; request validation; RLS hidden-product and cross-user order checks; atomic checkout retry/hash-conflict checks; Supabase security advisors clear. Commerce tests cover quantity aggregation, payment mismatch rejection, HMAC tampering and duplicate inventory reconciliation to 48.
Email confirmation/login and a real Square transaction still require owner configuration and have not been end-to-end tested.
