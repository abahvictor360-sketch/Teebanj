const assert = require("node:assert/strict");
const base = "http://127.0.0.1:8087/api/index.php?action=";
let cookie = "",
  csrf = "";
async function request(action, data, token = csrf) {
  const r = await fetch(base + action, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      Cookie: cookie,
      ...(data === undefined
        ? {}
        : { "Content-Type": "application/json", "X-CSRF-Token": token }),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const cookies = r.headers.getSetCookie();
  if (cookies.length) cookie = cookies.map((c) => c.split(";")[0]).join("; ");
  return { status: r.status, body: await r.json() };
}
(async () => {
  let r = await request("session");
  assert.equal(r.status, 200);
  csrf = r.body.csrf;
  assert.equal(csrf.length, 64);
  console.log("PASS: session and CSRF");
  r = await request("admin-data");
  assert.equal(r.status, 401);
  r = await request(
    "contact",
    {
      name: "Test",
      email: "test@example.invalid",
      subject: "test",
      message: "test",
    },
    "invalid",
  );
  assert.equal(r.status, 403);
  console.log("PASS: private admin endpoint and CSRF rejection");
  const email = "test-" + Date.now() + "@example.invalid";
  r = await request("register", {
    name: "Integration Test",
    email,
    password: "LocalTestPassword123!",
  });
  assert.equal(r.status, 200);
  r = await request("my-orders");
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.orders, []);
  console.log(
    "PASS: registration, hashed account storage, authenticated order list",
  );
  r = await request("contact", {
    name: "Test",
    email,
    subject: "Automated local test",
    message: "Test message saved to database",
  });
  assert.equal(r.status, 200);
  r = await request("subscribe", { email, consent: true });
  assert.equal(r.status, 200);
  r = await request("checkout", { id: "a".repeat(32) });
  assert.equal(r.status, 503);
  console.log(
    "PASS: contact, subscription and fail-closed unconfigured checkout",
  );
  r = await request("order&ref=" + "a".repeat(32));
  assert.equal(r.status, 404);
  r = await request("admin-login", {
    email: "info@teebanjfashionworld.ca",
    password: "TeebanjLocalTest123!",
  });
  assert.equal(r.status, 200);
  r = await request("admin-data");
  assert.equal(r.status, 200);
  assert.ok(r.body.messages.some((m) => m.email === email));
  assert.ok(r.body.subscribers.some((s) => s.email === email));
  console.log("PASS: administrator sees persisted message and subscriber");
  for (const p of [
    "config.local.php",
    "database/schema.sql",
    "api/bootstrap.php",
    "tests/setup-local.php",
  ]) {
    const res = await fetch("http://127.0.0.1:8087/" + p);
    assert.equal(res.status, 404);
  }
  console.log("PASS: private files blocked by local router");
  for (const file of require("node:fs")
    .readdirSync(require("node:path").join(__dirname, ".."))
    .filter((p) => p.endsWith(".html"))) {
    const r = await fetch("http://127.0.0.1:8087/" + file);
    assert.equal(r.status, 200, file);
    const html = await r.text();
    for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g))
      new (require("node:vm").Script)(m[1], { filename: file });
  }
  console.log("PASS: all HTML pages served and inline JavaScript parses");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
