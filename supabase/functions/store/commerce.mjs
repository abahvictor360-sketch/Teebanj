// Shared by Edge runtime and Node tests. Square remains the inventory authority.
export function normalizeItems(items) {
  if (!Array.isArray(items) || !items.length || items.length > 50)
    throw Error("Invalid bag.");
  const counts = new Map();
  for (const i of items) {
    if (
      typeof i?.id !== "string" ||
      !i.id.length ||
      i.id.length > 192 ||
      !Number.isInteger(i.qty) ||
      i.qty < 1 ||
      i.qty > 99
    )
      throw Error("Invalid item quantity.");
    counts.set(i.id, (counts.get(i.id) || 0) + i.qty);
  }
  if ([...counts.values()].some((n) => n > 99))
    throw Error("Maximum quantity is 99 per variation.");
  return [...counts]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, qty]) => ({ id, qty }));
}
export function present(o, location, fallback = false) {
  return (o.present_at_all_locations ?? fallback)
    ? !(o.absent_at_location_ids || []).includes(location)
    : (o.present_at_location_ids || []).includes(location);
}
export function variationPrice(v, location) {
  const d = v.item_variation_data;
  if (
    v.is_deleted ||
    !d ||
    d.pricing_type !== "FIXED_PRICING" ||
    !present(v, location, true)
  )
    throw Error("Variation is unavailable.");
  const override =
    (d.location_overrides || []).find((x) => x.location_id === location) || {};
  const price = override.price_money || d.price_money;
  if (
    !(override.track_inventory ?? d.track_inventory) ||
    override.sold_out ||
    price?.currency !== "CAD" ||
    !Number.isSafeInteger(price.amount) ||
    price.amount <= 0
  )
    throw Error("Variation is unavailable.");
  return price.amount;
}
export function sameOrder(actual, expected) {
  if (actual?.location_id !== expected.location_id) return false;
  const summarize = (items) =>
    (items || [])
      .map((i) => [
        i.catalog_object_id || "",
        i.catalog_object_id ? "" : i.name,
        Number(i.quantity),
        i.base_price_money?.currency,
        Number(i.base_price_money?.amount),
      ])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return (
    JSON.stringify(summarize(actual.line_items)) ===
    JSON.stringify(summarize(expected.line_items))
  );
}
export function paymentMatches(payment, remote, local) {
  return (
    payment.status === "COMPLETED" &&
    payment.order_id === local.square_order_id &&
    remote.id === local.square_order_id &&
    payment.location_id === local.square_request.order.location_id &&
    sameOrder(remote, local.square_request.order) &&
    payment.amount_money?.currency === "CAD" &&
    Number(payment.amount_money.amount) === Number(local.total_cents) &&
    remote.total_money?.currency === "CAD" &&
    Number(remote.total_money.amount) === Number(local.total_cents) &&
    remote.state === "COMPLETED"
  );
}
export async function signatureValid(raw, signature, key, url) {
  if (!signature || !key || !url) return false;
  try {
    const hmac = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(key),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      "HMAC",
      hmac,
      Uint8Array.from(atob(signature), (c) => c.charCodeAt(0)),
      new TextEncoder().encode(url + raw),
    );
  } catch {
    return false;
  }
}
export function createCommerce(db, env, checked, HttpError, transport = fetch) {
  const location = env("SQUARE_LOCATION_ID");
  const environment = env("SQUARE_ENVIRONMENT") || "sandbox";
  const configured = () =>
    !!location &&
    !!env("SQUARE_ACCESS_TOKEN") &&
    ["sandbox", "production"].includes(environment);
  function rules() {
    try {
      const r = JSON.parse(env("DELIVERY_RULES_JSON") || "{}");
      for (const [province, v] of Object.entries(r))
        if (
          !/^(AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT)$/.test(province) ||
          !Number.isSafeInteger(v.shipping_cents) ||
          v.shipping_cents < 0 ||
          v.shipping_cents > 100000 ||
          !Number.isFinite(v.tax_percent) ||
          v.tax_percent < 0 ||
          v.tax_percent > 30
        )
          throw Error();
      return r;
    } catch {
      return {};
    }
  }
  const enabled = () =>
    configured() &&
    env("CHECKOUT_ENABLED") === "true" &&
    !!env("SQUARE_WEBHOOK_SIGNATURE_KEY") &&
    /^https:\/\//.test(env("PUBLIC_SITE_URL") || "") &&
    Object.keys(rules()).length > 0;
  async function square(path, body) {
    if (!configured())
      throw new HttpError(503, "Square is not configured yet.");
    const r = await transport(
      (environment === "production"
        ? "https://connect.squareup.com/v2"
        : "https://connect.squareupsandbox.com/v2") + path,
      {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: "Bearer " + env("SQUARE_ACCESS_TOKEN"),
          "Square-Version": env("SQUARE_VERSION") || "2026-09-16",
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!r.ok)
      throw new HttpError(
        503,
        "Square is temporarily unavailable. Please retry.",
      );
    return r.json();
  }
  async function inventory(ids) {
    const counts = {};
    for (let start = 0; start < ids.length; start += 100) {
      let cursor;
      const seen = new Set();
      do {
        const r = await square("/inventory/counts/batch-retrieve", {
          catalog_object_ids: ids.slice(start, start + 100),
          location_ids: [location],
          states: ["IN_STOCK"],
          ...(cursor ? { cursor } : {}),
        });
        for (const c of r.counts || [])
          if (
            c.location_id === location &&
            c.state === "IN_STOCK" &&
            Number.isFinite(Number(c.quantity))
          )
            counts[c.catalog_object_id] = Math.max(0, Number(c.quantity));
        cursor = r.cursor;
        if (cursor && seen.has(cursor))
          throw new HttpError(503, "Square inventory pagination failed.");
        if (cursor) seen.add(cursor);
      } while (cursor);
    }
    return counts;
  }
  async function refresh(ids) {
    const counts = await inventory([...new Set(ids)]);
    for (const id of ids)
      checked(
        await db
          .from("products")
          .update({ stock: counts[id] || 0 })
          .eq("id", id),
      );
  }
  async function sync() {
    const objects = new Map();
    let cursor;
    const seen = new Set();
    do {
      const r = await square(
        "/catalog/list?types=ITEM,IMAGE,CATEGORY" +
          (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""),
      );
      for (const o of r.objects || []) objects.set(o.id, o);
      cursor = r.cursor;
      if (cursor && seen.has(cursor))
        throw new HttpError(503, "Square catalog pagination failed.");
      if (cursor) seen.add(cursor);
    } while (cursor);
    const rows = [];
    for (const item of objects.values()) {
      if (item.type !== "ITEM" || item.is_deleted || !present(item, location))
        continue;
      const d = item.item_data;
      const cats = (d.categories || [])
        .map((c) => objects.get(c.id)?.category_data?.name || "")
        .join(" ")
        .toLowerCase();
      const category = cats.includes("women")
        ? "women"
        : cats.includes("men")
          ? "men"
          : /accessor|bag|shoe|gele/.test(cats)
            ? "accessories"
            : "fabrics";
      for (const v of d.variations || []) {
        let price;
        try {
          price = variationPrice(v, location);
        } catch {
          continue;
        }
        const vd = v.item_variation_data;
        const image =
          objects.get((vd.image_ids || d.image_ids || [])[0])?.image_data
            ?.url || "";
        rows.push({
          id: v.id,
          square_item_id: item.id,
          name: d.name,
          description: (d.description_plaintext || d.description || "").replace(
            /<[^>]*>/g,
            "",
          ),
          category,
          variation_name: vd.name || "Default",
          sku: vd.sku || "",
          price_cents: price,
          image_url: image.startsWith("https://")
            ? image
            : "assets/site/product-placeholder.svg",
          stock: 0,
        });
      }
    }
    const counts = await inventory(rows.map((r) => r.id));
    for (const r of rows) r.stock = counts[r.id] || 0;
    return {
      count: checked(await db.rpc("replace_square_catalog", { p_rows: rows })),
    };
  }
  async function checkout(body, user) {
    if (!enabled())
      throw new HttpError(503, "Online checkout is not enabled yet.");
    if (!user) throw new HttpError(401, "Please sign in before checkout.");
    let items;
    try {
      items = normalizeItems(body.items);
    } catch (e) {
      throw new HttpError(400, e.message);
    }
    if (typeof body.id !== "string" || !/^[a-f0-9]{32}$/i.test(body.id))
      throw new HttpError(400, "Invalid checkout reference.");
    const id = body.id.replace(
      /(.{8})(.{4})(.{4})(.{4})(.{12})/,
      "$1-$2-$3-$4-$5",
    );
    const customer = {};
    for (const [key, max] of Object.entries({
      name: 120,
      email: 254,
      phone: 40,
      address: 200,
      city: 100,
      province: 2,
      postal: 10,
    })) {
      const v = body.customer?.[key];
      if (typeof v !== "string" || !v.trim() || v.trim().length > max)
        throw new HttpError(400, "Complete your delivery details.");
      customer[key] = v.trim();
    }
    customer.province = customer.province.toUpperCase();
    customer.postal = customer.postal.toUpperCase().replace(/\s/g, "");
    if (
      !/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(customer.postal) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)
    )
      throw new HttpError(400, "Check your email and Canadian postal code.");
    const rule = rules()[customer.province];
    if (!rule)
      throw new HttpError(400, "Delivery is not configured for that province.");
    const hash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(JSON.stringify({ customer, items })),
        ),
      ),
    )
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    let local = checked(
      await db.from("orders").select("*").eq("id", id).maybeSingle(),
    );
    if (local && (local.user_id !== user.id || local.request_hash !== hash))
      throw new HttpError(
        409,
        "Checkout reference already used. Start a new checkout.",
      );
    if (!local) {
      const products = checked(
        await db
          .from("products")
          .select("*")
          .in(
            "id",
            items.map((i) => i.id),
          )
          .eq("active", true),
      );
      if (
        products.length !== items.length ||
        products.some((p) => p.id.startsWith("preview-"))
      )
        throw new HttpError(409, "An item is unavailable.");
      const objects = await square("/catalog/batch-retrieve", {
        object_ids: items.map((i) => i.id),
        include_related_objects: true,
      });
      const map = new Map(
        [...(objects.objects || []), ...(objects.related_objects || [])].map(
          (o) => [o.id, o],
        ),
      );
      const counts = await inventory(items.map((i) => i.id));
      for (const p of products) {
        const v = map.get(p.id),
          parent = map.get(p.square_item_id);
        let price;
        try {
          if (
            !v ||
            !parent ||
            parent.is_deleted ||
            !present(parent, location) ||
            v.item_variation_data?.item_id !== p.square_item_id
          )
            throw Error();
          price = variationPrice(v, location);
        } catch {
          throw new HttpError(409, "An item is no longer available.");
        }
        if (price !== Number(p.price_cents))
          throw new HttpError(
            409,
            "An item price has changed. Ask the store to refresh the catalog.",
          );
        if ((counts[p.id] || 0) < items.find((i) => i.id === p.id).qty)
          throw new HttpError(
            409,
            "An item is out of stock or has insufficient stock.",
          );
      }
      const line_items = items.map((i) => ({
        catalog_object_id: i.id,
        quantity: String(i.qty),
        base_price_money: {
          amount: Number(products.find((p) => p.id === i.id).price_cents),
          currency: "CAD",
        },
      }));
      if (rule.shipping_cents)
        line_items.push({
          name: "Shipping",
          quantity: "1",
          base_price_money: { amount: rule.shipping_cents, currency: "CAD" },
        });
      const order = {
        location_id: location,
        reference_id: id,
        line_items,
        pricing_options: {
          auto_apply_discounts: false,
          auto_apply_taxes: false,
        },
        ...(rule.tax_percent
          ? {
              taxes: [
                {
                  uid: "delivery-tax",
                  name: "Sales tax",
                  percentage: String(rule.tax_percent),
                  scope: "ORDER",
                  type: "ADDITIVE",
                },
              ],
            }
          : {}),
      };
      const calculated = (await square("/orders/calculate", { order })).order;
      if (
        !sameOrder(calculated, order) ||
        calculated.total_money?.currency !== "CAD" ||
        !Number.isSafeInteger(calculated.total_money.amount) ||
        calculated.total_money.amount <= 0
      )
        throw new HttpError(503, "Could not verify the order total.");
      const request = {
        idempotency_key: "teebanj-" + id,
        order,
        checkout_options: {
          redirect_url:
            env("PUBLIC_SITE_URL").replace(/\/$/, "") + "/order.html?ref=" + id,
          ask_for_shipping_address: false,
          allow_tipping: false,
        },
        pre_populated_data: { buyer_email: customer.email },
      };
      local = checked(
        await db.rpc("create_checkout", {
          p_id: id,
          p_user: user.id,
          p_hash: hash,
          p_customer: customer,
          p_request: request,
          p_total: calculated.total_money.amount,
          p_items: items.map((i) => ({
            product_id: i.id,
            name: products.find((p) => p.id === i.id).name,
            quantity: i.qty,
            price_cents: Number(
              products.find((p) => p.id === i.id).price_cents,
            ),
          })),
        }),
      );
    }
    if (local.status !== "pending")
      throw new HttpError(409, "This order has already been processed.");
    if (local.checkout_url) return { id: local.id, url: local.checkout_url };
    // Retry the exact persisted request. An ambiguous timeout cannot create a second order.
    const link = (
      await square("/online-checkout/payment-links", local.square_request)
    ).payment_link;
    if (!link?.id || !link.order_id || !/^https:\/\//.test(link.url))
      throw new HttpError(503, "Could not create payment link.");
    const remote = (
      await square("/orders/" + encodeURIComponent(link.order_id))
    ).order;
    if (
      !sameOrder(remote, local.square_request.order) ||
      remote.total_money?.currency !== "CAD" ||
      Number(remote.total_money.amount) !== Number(local.total_cents)
    )
      throw new HttpError(503, "Payment link total verification failed.");
    checked(
      await db
        .from("orders")
        .update({
          square_order_id: link.order_id,
          payment_link_id: link.id,
          checkout_url: link.url,
        })
        .eq("id", local.id),
    );
    return { id: local.id, url: link.url };
  }
  async function reconcile(local) {
    if (!local?.square_order_id) return;
    const remote = (
      await square("/orders/" + encodeURIComponent(local.square_order_id))
    ).order;
    if (!remote || remote.id !== local.square_order_id)
      throw new HttpError(503, "Could not verify Square order.");
    let paid = false,
      refund = false;
    for (const tender of remote.tenders || []) {
      if (!tender.payment_id) continue;
      const payment = (
        await square("/payments/" + encodeURIComponent(tender.payment_id))
      ).payment;
      if (paymentMatches(payment, remote, local)) {
        paid = true;
        refund = Number(payment.refunded_money?.amount || 0) > 0;
        checked(
          await db
            .from("orders")
            .update({
              status: refund ? "refund_review" : "paid",
              payment_id: payment.id,
              receipt_url: payment.receipt_url || null,
            })
            .eq("id", local.id)
            .eq("status", "pending"),
        );
        if (refund)
          checked(
            await db
              .from("orders")
              .update({ status: "refund_review" })
              .eq("id", local.id)
              .in("status", ["paid", "shipped"]),
          );
      }
    }
    // Refresh even on duplicate notifications; never send a second sale adjustment.
    await refresh(
      local.square_request.order.line_items
        .filter((i) => i.catalog_object_id)
        .map((i) => i.catalog_object_id),
    );
    if (remote.state === "COMPLETED" && !paid)
      throw new HttpError(
        409,
        "Payment requires manual review: order details did not match.",
      );
  }
  async function webhook(raw, signature) {
    const webhookUrl =
      env("SQUARE_WEBHOOK_URL") ||
      env("SUPABASE_URL") + "/functions/v1/store?action=webhook";
    if (!configured() || !env("SQUARE_WEBHOOK_SIGNATURE_KEY"))
      throw new HttpError(503, "Square is not configured yet.");
    if (
      !(await signatureValid(
        raw,
        signature,
        env("SQUARE_WEBHOOK_SIGNATURE_KEY"),
        webhookUrl,
      ))
    )
      throw new HttpError(403, "Invalid webhook signature.");
    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      throw new HttpError(400, "Invalid event.");
    }
    if (
      typeof event.event_id !== "string" ||
      !event.event_id ||
      event.event_id.length > 192
    )
      throw new HttpError(400, "Invalid event ID.");
    if (
      checked(
        await db
          .from("webhook_events")
          .select("id")
          .eq("id", event.event_id)
          .maybeSingle(),
      )
    )
      return { ok: true };
    if (
      [
        "payment.created",
        "payment.updated",
        "refund.created",
        "refund.updated",
      ].includes(event.type)
    ) {
      const paymentId =
        event.data?.object?.payment?.id ||
        event.data?.object?.refund?.payment_id;
      if (paymentId) {
        const payment = (
          await square("/payments/" + encodeURIComponent(paymentId))
        ).payment;
        if (payment?.order_id) {
          const local = checked(
            await db
              .from("orders")
              .select("*")
              .eq("square_order_id", payment.order_id)
              .maybeSingle(),
          );
          if (local) await reconcile(local);
          else {
            // The link API may have succeeded before our database update completed.
            const remote = (
              await square("/orders/" + encodeURIComponent(payment.order_id))
            ).order;
            if (/^[a-f0-9-]{36}$/i.test(remote?.reference_id || "")) {
              const pending = checked(
                await db
                  .from("orders")
                  .select("id")
                  .eq("id", remote.reference_id)
                  .maybeSingle(),
              );
              if (pending)
                throw new HttpError(
                  503,
                  "Order is still being linked; retry notification.",
                );
            }
          }
        }
      }
    } else if (event.type === "inventory.count.updated") {
      const ids = [
        ...new Set(
          (event.data?.object?.inventory_counts || [])
            .filter((c) => c.location_id === location)
            .map((c) => c.catalog_object_id),
        ),
      ];
      if (ids.length) await refresh(ids);
    } else if (event.type === "catalog.version.updated") {
      // A product, price, photo or variation changed in Square: re-import so
      // new items appear on the website without a manual sync.
      await sync();
    }
    checked(
      await db
        .from("webhook_events")
        .upsert(
          { id: event.event_id },
          { onConflict: "id", ignoreDuplicates: true },
        ),
    );
    return { ok: true };
  }
  return {
    enabled,
    provinces: () => Object.keys(rules()),
    checkout,
    sync,
    reconcile,
    webhook,
  };
}
