import assert from "node:assert/strict";
import { url, key } from "./config.js";
async function call(action, expected, body, extra = {}) {
  const r = await fetch(url + "/functions/v1/store?action=" + action, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      apikey: key,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...extra,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.equal(r.status, expected, action + ": " + (await r.clone().text()));
  assert.equal(r.headers.get("access-control-allow-origin"), "*");
  return r.json();
}
const catalog = await call("catalog", 200);
assert.equal(catalog.products.length, 20);
assert(catalog.products.every((p) => p.preview && p.stock === 0));
const session = await call("session", 200);
assert.equal(session.customer, null);
assert.equal(session.admin, false);
assert.equal(session.checkout_enabled, false);
await call("my-orders", 401);
await call("admin-data", 403);
await call("admin-tracking", 403, {});
await call("session", 401, undefined, { Authorization: "Bearer invalid" });
await call("checkout", 503, { items: [] });
await call("subscribe", 400, { email: "test@example.invalid", consent: false });
await call("contact", 400, { name: "", email: "invalid" });
const options = await fetch(url + "/functions/v1/store", {
  method: "OPTIONS",
  headers: {
    Origin: "https://example.com",
    "Access-Control-Request-Headers": "apikey,content-type",
  },
});
assert.equal(options.status, 204);
for (const table of ["orders", "messages", "subscribers", "store_admins"]) {
  const r = await fetch(url + "/rest/v1/" + table + "?select=*", {
    headers: { apikey: key },
  });
  assert(
    [401, 403].includes(r.status),
    table + " exposed to anonymous visitor",
  );
}
console.log(
  "PASS: live catalog, session, protected routes, invalid JWT, disabled checkout, input validation, CORS and private table access.",
);
