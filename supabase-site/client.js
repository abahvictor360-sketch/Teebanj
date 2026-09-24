import { createClient } from "@supabase/supabase-js";
import { url, key } from "./config.js";
const client = createClient(url, key);
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
    if (error) throw Error(error.message === "Invalid login credentials" ? "Invalid login credentials. Register this email first or use the password-reset email." : error.message);
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
        data: { name: body.name, must_change_password: true },
        emailRedirectTo: new URL("account.html", location.href).href,
      },
    });
    if (error) throw error;
    if (!data.session)
      document.getElementById("accountStatus").textContent =
        "Check your email to confirm your account, then sign in.";
    return { ok: true };
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
document.addEventListener("click", (event) => {
  const toggle = event.target.closest(".password-toggle");
  if (!toggle) return;
  const input = toggle.previousElementSibling;
  input.type = input.type === "password" ? "text" : "password";
  toggle.setAttribute("aria-label", input.type === "password" ? "Show password" : "Hide password");
});
async function script(src) {
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.append(s);
  });
}
async function start() {
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
  await script("js/products.js");
  await script("js/main.js");
  document.dispatchEvent(new Event("teebanj:ready"));
}
start().catch(() => {
  const note = document.createElement("p");
  note.setAttribute("role", "alert");
  note.textContent = "The store could not load. Please refresh the page.";
  document.body.prepend(note);
});
