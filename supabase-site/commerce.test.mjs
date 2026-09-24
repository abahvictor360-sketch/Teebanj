import assert from "node:assert/strict";
import {
  normalizeItems,
  variationPrice,
  paymentMatches,
  signatureValid,
  createCommerce,
} from "../supabase/functions/store/commerce.mjs";
assert.deepEqual(
  normalizeItems([
    { id: "a", qty: 1 },
    { id: "a", qty: 2 },
  ]),
  [{ id: "a", qty: 3 }],
);
assert.throws(() =>
  normalizeItems([
    { id: "a", qty: 70 },
    { id: "a", qty: 30 },
  ]),
);
for (const qty of [0, -1, 1.5, "2", NaN])
  assert.throws(() => normalizeItems([{ id: "a", qty }]));
const variation = {
  item_variation_data: {
    pricing_type: "FIXED_PRICING",
    track_inventory: true,
    price_money: { amount: 1000, currency: "CAD" },
  },
};
assert.equal(variationPrice(variation, "LOC"), 1000);
assert.throws(() =>
  variationPrice(
    {
      ...variation,
      item_variation_data: {
        ...variation.item_variation_data,
        location_overrides: [{ location_id: "LOC", sold_out: true }],
      },
    },
    "LOC",
  ),
);
const expected = {
  location_id: "LOC",
  line_items: [
    {
      catalog_object_id: "ITEM",
      quantity: "2",
      base_price_money: { amount: 1000, currency: "CAD" },
    },
  ],
};
const local = {
  id: "local",
  square_order_id: "remote",
  status: "pending",
  total_cents: 2000,
  square_request: { order: expected },
};
const remote = {
  ...expected,
  id: "remote",
  state: "COMPLETED",
  total_money: { amount: 2000, currency: "CAD" },
  tenders: [{ payment_id: "payment" }],
};
const payment = {
  id: "payment",
  status: "COMPLETED",
  order_id: "remote",
  location_id: "LOC",
  amount_money: { amount: 2000, currency: "CAD" },
};
assert(paymentMatches(payment, remote, local));
for (const change of [
  { location_id: "OTHER" },
  { order_id: "OTHER" },
  { status: "APPROVED" },
  { amount_money: { amount: 1000, currency: "CAD" } },
  { amount_money: { amount: 2000, currency: "USD" } },
])
  assert(!paymentMatches({ ...payment, ...change }, remote, local));
assert(
  !paymentMatches(
    payment,
    { ...remote, line_items: [{ ...expected.line_items[0], quantity: "1" }] },
    local,
  ),
);
assert(
  !paymentMatches(
    payment,
    {
      ...remote,
      line_items: [{ ...expected.line_items[0], catalog_object_id: "OTHER" }],
    },
    local,
  ),
);
const raw = '{"event_id":"event"}',
  url = "https://example.com/webhook",
  secret = "test-only";
const key = await crypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(secret),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign"],
);
const signature = Buffer.from(
  await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(url + raw)),
).toString("base64");
assert(await signatureValid(raw, signature, secret, url));
assert(!(await signatureValid(raw + " ", signature, secret, url)));
assert(!(await signatureValid(raw, signature, secret, url + "/")));
assert(!(await signatureValid(raw, "invalid", secret, url)));
const writes = [],
  requests = [];
const db = {
  from(table) {
    return {
      update(data) {
        const q = {
          eq() {
            return q;
          },
          in() {
            return q;
          },
          then(resolve) {
            writes.push({ table, data });
            resolve({ data: [], error: null });
          },
        };
        return q;
      },
    };
  },
};
const env = (n) =>
  ({
    SQUARE_LOCATION_ID: "LOC",
    SQUARE_ACCESS_TOKEN: "test-token",
    SQUARE_ENVIRONMENT: "sandbox",
  })[n];
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const commerce = createCommerce(
  db,
  env,
  (r) => {
    if (r.error) throw r.error;
    return r.data;
  },
  HttpError,
  async (url) => {
    requests.push(url);
    const data = url.endsWith("/orders/remote")
      ? { order: remote }
      : url.endsWith("/payments/payment")
        ? { payment }
        : {
            counts: [
              {
                catalog_object_id: "ITEM",
                location_id: "LOC",
                state: "IN_STOCK",
                quantity: "48",
              },
            ],
          };
    return new Response(JSON.stringify(data), { status: 200 });
  },
);
await commerce.reconcile(local);
await commerce.reconcile(local);
assert.deepEqual(
  writes.filter((w) => w.table === "products").map((w) => w.data.stock),
  [48, 48],
);
assert(!requests.some((url) => url.includes("/inventory/changes")));
assert.equal(commerce.enabled(), false);
console.log(
  "PASS: quantity aggregation, tracked variations, payment amount/location/items, HMAC tampering, duplicate reconciliation keeps inventory at 48 without a second deduction.",
);
