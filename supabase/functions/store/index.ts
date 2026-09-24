import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { createCommerce } from "./commerce.mjs";
const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function checked<T>(r: { data: T; error: unknown }): T {
  if (r.error)
    throw new HttpError(503, "Store service is temporarily unavailable.");
  return r.data;
}
function field(v: unknown, label: string, max: number, min = 1) {
  if (typeof v !== "string" || v.trim().length < min || v.trim().length > max)
    throw new HttpError(400, "Please provide a valid " + label + ".");
  return v.trim();
}
function email(v: unknown) {
  const s = field(v, "email address", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
    throw new HttpError(400, "Please provide a valid email address.");
  return s;
}
async function limit(action: string, identity: string, max: number) {
  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (
    !checked(
      await db.rpc("take_request_slot", {
        p_key: action + ":" + hash,
        p_limit: max,
      }),
    )
  )
    throw new HttpError(429, "Too many requests. Please try again later.");
}
const orderFields = "id,status,total_cents,tracking,created_at,updated_at";
const commerce = createCommerce(
  db,
  (name: string) => Deno.env.get(name),
  checked,
  HttpError,
);
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  try {
    const url = new URL(req.url),
      action = url.searchParams.get("action") || "catalog";
    const reads = ["catalog", "session", "my-orders", "order", "admin-data"];
    if (req.method !== (reads.includes(action) ? "GET" : "POST"))
      throw new HttpError(405, "Method not allowed.");
    // Validate any supplied token; never silently downgrade an invalid user to guest.
    let user = null;
    const auth = req.headers.get("authorization");
    if (auth) {
      if (!auth.startsWith("Bearer "))
        throw new HttpError(401, "Please sign in again.");
      const r = await db.auth.getUser(auth.slice(7));
      if (r.error || !r.data.user)
        throw new HttpError(401, "Please sign in again.");
      user = r.data.user;
    }
    let admin = false;
    if (user && (action === "session" || action.startsWith("admin-")))
      admin = !!checked(
        await db
          .from("store_admins")
          .select("user_id")
          .eq("user_id", user.id)
          .maybeSingle(),
      );
    if (action.startsWith("admin-") && !admin)
      throw new HttpError(403, "Administrator access required.");
    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      if (!req.headers.get("content-type")?.includes("application/json"))
        throw new HttpError(415, "JSON required.");
      const reader = req.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader)
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 16384) {
            await reader.cancel();
            throw new HttpError(413, "Request is too large.");
          }
          chunks.push(value);
        }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const c of chunks) {
        bytes.set(c, offset);
        offset += c.length;
      }
      const raw = new TextDecoder().decode(bytes);
      if (action === "webhook")
        return new Response(
          JSON.stringify(
            await commerce.webhook(
              raw,
              req.headers.get("x-square-hmacsha256-signature"),
            ),
          ),
          { headers },
        );
      try {
        body = JSON.parse(raw);
      } catch {
        throw new HttpError(400, "Invalid JSON.");
      }
      if (!body || Array.isArray(body) || typeof body !== "object")
        throw new HttpError(400, "Invalid request.");
    }
    let result: unknown;
    switch (action) {
      case "catalog": {
        const rows = checked(
          await db
            .from("products")
            .select(
              "id,name,description,category,variation_name,price_cents,image_url,stock",
            )
            .eq("active", true)
            .order("name")
            .limit(1000),
        );
        result = {
          products: rows.map((p) => ({
            id: p.id,
            name: p.name,
            cat: p.category,
            desc: p.description,
            variation: p.variation_name,
            price: Number(p.price_cents) / 100,
            image: p.image_url,
            stock: Number(p.stock),
            colors: ["#222222"],
            rating: 0,
            reviews: 0,
            tags: [],
            preview: p.id.startsWith("preview-"),
          })),
        };
        break;
      }
      case "session":
        result = {
          customer: user
            ? {
                id: user.id,
                email: user.email,
                name: user.user_metadata?.name || user.email,
              }
            : null,
          admin,
          checkout_enabled: commerce.enabled(),
          provinces: commerce.provinces(),
          csrf: "",
        };
        break;
      case "my-orders":
        if (!user)
          throw new HttpError(401, "Please sign in to view your orders.");
        result = {
          orders: checked(
            await db
              .from("orders")
              .select(orderFields)
              .eq("user_id", user.id)
              .order("created_at", { ascending: false })
              .limit(100),
          ),
        };
        break;
      case "order": {
        if (!user)
          throw new HttpError(401, "Please sign in to view your order.");
        const ref = url.searchParams.get("ref") || "";
        if (!/^[a-f0-9-]{32,36}$/i.test(ref))
          throw new HttpError(400, "Invalid order reference.");
        const order = checked(
          await db
            .from("orders")
            .select(orderFields)
            .eq("id", ref)
            .eq("user_id", user.id)
            .maybeSingle(),
        );
        if (!order) throw new HttpError(404, "Order not found.");
        result = { order };
        break;
      }
      case "contact":
      case "subscribe": {
        // Global cap remains effective even if a caller varies forwarded headers.
        await limit(action, "global", 200);
        await limit(
          action,
          user?.id ||
            req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            "unknown",
          10,
        );
        const address = email(body.email);
        if (action === "contact")
          checked(
            await db
              .from("messages")
              .insert({
                name: field(body.name, "name", 120),
                email: address,
                subject: field(body.subject, "subject", 160),
                message: field(body.message, "message", 5000, 10),
              }),
          );
        else {
          if (![true, "on", "1", 1].includes(body.consent as never))
            throw new HttpError(400, "Please agree to receive our newsletter.");
          checked(
            await db
              .from("subscribers")
              .upsert(
                { email: address },
                { onConflict: "email", ignoreDuplicates: true },
              ),
          );
        }
        result = { ok: true };
        break;
      }
      case "admin-data": {
        const orders = checked(
          await db
            .from("orders")
            .select(
              "id,status,total_cents,customer,tracking,created_at,order_items(name,quantity,price_cents)",
            )
            .order("created_at", { ascending: false })
            .limit(100),
        );
        result = {
          orders: orders.map((o) => ({
            ...o,
            customer_json: JSON.stringify(o.customer),
            items: o.order_items,
          })),
          products: checked(
            await db.from("products").select("*").order("name").limit(1000),
          ),
          messages: checked(
            await db
              .from("messages")
              .select("*")
              .order("created_at", { ascending: false })
              .limit(100),
          ),
          subscribers: checked(
            await db
              .from("subscribers")
              .select("*")
              .order("consent_at", { ascending: false })
              .limit(1000),
          ),
        };
        break;
      }
      case "admin-tracking": {
        const id = field(body.id, "order reference", 36, 32);
        if (!/^[a-f0-9-]{32,36}$/i.test(id))
          throw new HttpError(400, "Invalid order reference.");
        const tracking = field(body.tracking, "tracking details", 500);
        const rows = checked(
          await db
            .from("orders")
            .update({ tracking, status: "shipped" })
            .eq("id", id)
            .in("status", ["paid", "shipped"])
            .select("id"),
        );
        if (!rows.length)
          throw new HttpError(409, "Only paid orders can be marked shipped.");
        result = { ok: true };
        break;
      }
      case "checkout":
        await limit(action, user?.id || "guest", 20);
        result = await commerce.checkout(body, user);
        break;
      case "admin-sync":
        await limit(action, user!.id, 10);
        result = await commerce.sync();
        break;
      case "admin-refresh": {
        const id = field(body.id, "order reference", 36, 32);
        if (!/^[a-f0-9-]{32,36}$/i.test(id))
          throw new HttpError(400, "Invalid order reference.");
        const local = checked(
          await db.from("orders").select("*").eq("id", id).maybeSingle(),
        );
        if (!local) throw new HttpError(404, "Order not found.");
        await commerce.reconcile(local);
        result = { ok: true };
        break;
      }
      default:
        throw new HttpError(404, "Unknown action.");
    }
    return new Response(JSON.stringify(result), { headers });
  } catch (e) {
    const known = e instanceof HttpError;
    return new Response(
      JSON.stringify({
        error: known ? e.message : "Store service is temporarily unavailable.",
      }),
      { status: known ? e.status : 503, headers },
    );
  }
});
