let sessionPromise;
async function sessionInfo(refresh = false) {
  if (refresh) sessionPromise = null;
  if (!sessionPromise)
    sessionPromise = fetch("api/index.php?action=session", {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error || "Store service unavailable");
        return d;
      })
      .catch((e) => {
        sessionPromise = null;
        throw e;
      });
  return sessionPromise;
}
async function api(action, data) {
  const options = { cache: "no-store", credentials: "same-origin" };
  if (data !== undefined) {
    const s = await sessionInfo();
    options.method = "POST";
    options.headers = {
      "Content-Type": "application/json",
      "X-CSRF-Token": s.csrf,
    };
    options.body = JSON.stringify(data);
  }
  const r = await fetch("api/index.php?action=" + action, options);
  const d = await r.json();
  if (!r.ok) throw Error(d.error || "Please try again.");
  return d;
}
function formAction(id, action, make, onSuccess) {
  document.getElementById(id)?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    const status = form.querySelector('[role="status"]');
    if (status) status.textContent = "Please wait…";
    try {
      const result = await api(action, make(new FormData(form)));
      await onSuccess(result, form);
      if (status) status.textContent = "";
    } catch (err) {
      if (status) status.textContent = err.message;
      else toast(err.message);
    } finally {
      button.disabled = false;
    }
  });
}
