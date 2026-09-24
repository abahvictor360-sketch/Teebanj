import { createClient } from "@supabase/supabase-js";
import { url, key } from "./config.js";
const client = createClient(url, key);
// Read before supabase-js consumes the URL fragment of a password-reset link.
window.TEEBANJ_RECOVERY = /type=recovery/.test(location.hash);
window.TEEBANJ_AUTH = { reset: true };
client.auth.onAuthStateChange((event) => {
  if (event !== "PASSWORD_RECOVERY") return;
  window.TEEBANJ_RECOVERY = true;
  document.dispatchEvent(new Event("teebanj:recovery"));
});
async function requirePasswordChange() {
  const { data: { user } } = await client.auth.getUser();
  if (!user?.user_metadata?.must_change_password) return;
  const form = document.createElement("form");
  form.className = "card password-change-prompt";
  form.innerHTML = `<h2>Change your temporary password</h2><p>For security, choose a new password before continuing.</p><div class="field"><label>New password</label><input name="password" type="password" minlength="12" maxlength="72" required autocomplete="new-password"></div><div class="field"><label>Confirm new password</label><input name="confirm" type="password" minlength="12" maxlength="72" required autocomplete="new-password"></div><button class="btn btn-primary" type="submit">Change password</button><p role="status"></p>`;
  document.querySelector("main")?.prepend(form);
  await new Promise((resolve) => form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form), password = String(data.get("password")), confirm = String(data.get("confirm")), status = form.querySelector("[role=status]"), button = form.querySelector("button");
    if (password !== confirm) { status.textContent = "Passwords do not match."; return; }
    button.disabled = true; status.textContent = "Updating…";
    const { error } = await client.auth.updateUser({ password, data: { must_change_password: false } });
    button.disabled = false;
    if (error) { status.textContent = error.message; return; }
    status.textContent = "Password changed."; form.remove(); resolve();
  }));
}
async function api(action, body) {
  if (action === "login" || action === "admin-login") {
    const { error } = await client.auth.signInWithPassword({
      email: body.email,
      password: body.password,
    });
    if (error) throw Error(error.message === "Invalid login credentials" ? "That email and password do not match. Check them and try again, or use Forgot password." : error.message);
    await requirePasswordChange();
    if (action === "admin-login" && !(await api("session")).admin) {
      await client.auth.signOut();
      throw Error("This account does not have administrator access.");
    }
    return { ok: true };
  }
  if (action === "register") {
    const { data, error } = await client.auth.signUp({
      email: body.email,
      password: body.password,
      options: {
        data: { name: body.name },
        emailRedirectTo: new URL("account.html", location.href).href,
      },
    });
    if (error) throw error;
    if (!data.session)
      document.getElementById("accountStatus").textContent =
        "Check your email to confirm your account, then sign in.";
    return { ok: true };
  }
  if (action === "password-reset") {
    const { error } = await client.auth.resetPasswordForEmail(body.email, {
      redirectTo: new URL("account.html", location.href).href,
    });
    if (error) throw error;
    return { ok: true };
  }
  if (action === "update-password") {
    const { error } = await client.auth.updateUser({
      password: body.password,
      data: { must_change_password: false },
    });
    if (error) throw error;
    return { ok: true };
  }
  if (action === "content-save") {
    const rows = body.entries.map(({ key, value }) => ({ key, value }));
    const { error } = await client.from("site_content").upsert(rows);
    if (error) throw Error(error.message.includes("row-level security") ? "Only administrators can change site content." : error.message);
    rows.forEach((r) => (window.TEEBANJ_CONTENT[r.key] = r.value));
    return { ok: true };
  }
  if (action === "media-upload") {
    const file = body.file;
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw Error("Please choose a JPG, PNG, WebP or GIF image.");
    if (file.size > 5 * 1024 * 1024) throw Error("Images must be 5 MB or smaller.");
    const path = Date.now() + "-" + file.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").slice(-60);
    const { error } = await client.storage.from("site-media").upload(path, file, { contentType: file.type, cacheControl: "31536000" });
    if (error) throw Error(error.message.includes("row-level security") ? "Only administrators can upload images." : error.message);
    return { url: client.storage.from("site-media").getPublicUrl(path).data.publicUrl };
  }
  if (action === "logout") {
    const { error } = await client.auth.signOut();
    if (error) throw error;
    return { ok: true };
  }
  const {
    data: { session },
  } = await client.auth.getSession();
  const headers = { apikey: key };
  if (session) headers.Authorization = "Bearer " + session.access_token;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(url + "/functions/v1/store?action=" + action, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "Store service unavailable.");
  return result;
}
window.api = api;
window.sessionInfo = () => api("session");
window.formAction = (id, action, make, success) => {
  document.getElementById(id)?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget,
      button = form.querySelector('button[type="submit"]'),
      status = form.querySelector('[role="status"]');
    button.disabled = true;
    if (status) status.textContent = "Please wait…";
    try {
      await success(await api(action, make(new FormData(form))), form);
      if (status) status.textContent = "";
    } catch (error) {
      if (status) status.textContent = error.message;
      else window.toast(error.message);
    } finally {
      button.disabled = false;
    }
  });
};
async function script(src) {
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.append(s);
  });
}
async function loadContent() {
  try {
    const { data, error } = await client.from("site_content").select("key,value");
    if (error) throw error;
    window.TEEBANJ_CONTENT = Object.fromEntries(data.map((r) => [r.key, r.value]));
  } catch {
    window.TEEBANJ_CONTENT = {};
  }
}
async function start() {
  const content = loadContent();
  try {
    const { products } = await api("catalog");
    window.TEEBANJ_CATALOG = products;
    window.TEEBANJ_READY = true;
  } catch {
    const note = document.createElement("p");
    note.setAttribute("role", "status");
    note.textContent =
      "The live collection is temporarily unavailable. Preview items are shown; please contact us to order.";
    document.querySelector("main")?.prepend(note);
  }
  await content;
  await script("js/products.js");
  await script("js/content.js");
  await script("js/main.js");
  document.dispatchEvent(new Event("teebanj:ready"));
}
start().catch(() => {
  const note = document.createElement("p");
  note.setAttribute("role", "alert");
  note.textContent = "The store could not load. Please refresh the page.";
  document.body.prepend(note);
});
