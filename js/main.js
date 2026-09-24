const store = {
  get(k, d) {
    try {
      return JSON.parse(localStorage.getItem("teebanj." + k)) ?? d;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem("teebanj." + k, JSON.stringify(v));
    } catch {}
  },
};
let cart = store.get("cart", []);
if (!Array.isArray(cart)) cart = [];
cart = cart.filter(
  (l) =>
    l &&
    typeof l.id === "string" &&
    Number.isInteger(l.qty) &&
    l.qty > 0 &&
    l.qty <= 99,
);
let wishlist = store.get("wishlist", []);
if (!Array.isArray(wishlist)) wishlist = [];
const cartCount = () => cart.reduce((sum, l) => sum + l.qty, 0);
const cartTotal = () =>
  cart.reduce(
    (sum, l) => sum + (PRODUCTS.find((p) => p.id === l.id)?.price || 0) * l.qty,
    0,
  );
const waLink = (msg) =>
  "https://wa.me/19025933718?text=" +
  encodeURIComponent(msg || "Hello Teebanj Fashion World");
function saveCart() {
  store.set("cart", cart);
  document
    .querySelectorAll("[data-cart-count]")
    .forEach((el) => (el.textContent = cartCount()));
}
function toast(message) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "store-toast";
    el.setAttribute("role", "status");
    document.body.append(el);
  }
  el.textContent = message;
  el.hidden = false;
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => (el.hidden = true), 5000);
}
function addToCart(id, opts = {}) {
  const p = PRODUCTS.find((x) => x.id === id);
  if (!p) return;
  const qty = opts.qty || 1;
  const line = cart.find((l) => l.id === id);
  if (
    !Number.isInteger(qty) ||
    qty < 1 ||
    qty + (line?.qty || 0) > Math.min(99, p.stock)
  ) {
    toast("That quantity is not available.");
    return;
  }
  if (line) line.qty += qty;
  else cart.push({ id, qty });
  saveCart();
  toast("Added to your bag");
}
function toggleWish(id) {
  wishlist = wishlist.includes(id)
    ? wishlist.filter((x) => x !== id)
    : [...wishlist, id];
  store.set("wishlist", wishlist);
  toast("Wishlist updated");
}
function productCard(p) {
  return `<article class="product-card"><div class="pc-media"><a href="product.html?id=${encodeURIComponent(p.id)}"><img src="${escapeHtml(img(p))}" alt="${escapeHtml(p.name)}" loading="lazy"></a><button class="wish" data-wish="${escapeHtml(p.id)}" aria-label="Save ${escapeHtml(p.name)}">♡</button></div><div class="pc-body"><span class="pc-cat">${catName(p.cat)}</span><a class="pc-name" href="product.html?id=${encodeURIComponent(p.id)}">${escapeHtml(p.name)}</a><span class="pc-price">${money(p.price)}</span><div class="pc-foot"><span class="muted">${p.preview ? "Enquire for availability" : p.stock > 0 ? "Available" : "Sold out"}</span>${p.preview ? `<a class="btn btn-sm btn-primary" href="contact.html">Enquire</a>` : `<button class="btn btn-sm btn-primary" data-add="${escapeHtml(p.id)}" ${p.stock < 1 ? "disabled" : ""}>Add to bag</button>`}</div></div></article>`;
}
function renderGrid(el, list) {
  if (el)
    el.innerHTML = list.length
      ? list.map(productCard).join("")
      : '<p class="empty">Our online collection is being updated. Please <a href="contact.html">contact us</a> for available pieces.</p>';
}
const brand = '<a class="logo supplied-logo" href="index.html" aria-label="Teebanj Fashion World home"><span class="supplied-logo-window"><img src="assets/site/teebanj-logo-transparent.png" alt="Teebanj Fashion World — African roots, global style" width="1254" height="1254"></span></a>';
function renderShell() {
  const h = document.querySelector('[data-shell="header"]');
  if (h)
    h.innerHTML = `<div class="topbar">African heritage. Modern style. · Moncton, Canada</div><header class="site-header"><div class="header-inner">${brand}<nav class="nav" id="nav" aria-label="Main navigation">${[
      ["Home", "index.html"],
      ["Shop", "shop.html"],
      ["Our story", "about.html"],
      ["Custom designs", "custom.html"],
      ["Contact", "contact.html"],
    ]
      .map(
        ([t, u]) =>
          `<a href="${u}" ${location.pathname.endsWith(u) ? 'class="active"' : ""}>${t}</a>`,
      )
      .join(
        "",
      )}</nav><div class="header-actions"><a href="account.html" aria-label="Your account">Account</a><a href="cart.html" class="bag-link">Bag <span data-cart-count>${cartCount()}</span></a><button class="icon-btn menu-toggle" id="menuToggle" aria-label="Toggle navigation" aria-expanded="false">☰</button></div></div></header>`;
  document.getElementById("menuToggle")?.addEventListener("click", (e) => {
    const open = document.getElementById("nav").classList.toggle("open");
    e.currentTarget.setAttribute("aria-expanded", String(open));
  });
  const f = document.querySelector('[data-shell="footer"]');
  if (f)
    f.innerHTML = `<footer class="site-footer"><div class="wrap"><div class="foot-grid"><div>${brand}<p>African fabrics, ready-to-wear collections and custom designs. Where culture meets style.</p></div><div><h4>Explore</h4><ul>${CATEGORIES.map((c) => `<li><a href="shop.html?cat=${c.slug}">${c.name}</a></li>`).join("")}<li><a href="wishlist.html">Wishlist</a></li></ul></div><div><h4>Here to help</h4><ul><li><a href="contact.html#faq">Shipping & returns</a></li><li><a href="account.html">My orders</a></li><li><a href="custom.html">Custom designs</a></li><li><a href="privacy.html">Privacy</a></li></ul></div><div><h4>Contact us</h4><p>Moncton, New Brunswick, Canada</p><a href="tel:+19025933718">902-593-3718</a><br><a href="mailto:info@teebanjfashionworld.ca">info@teebanjfashionworld.ca</a><p>Monday–Saturday: 10am–6pm<br>Sunday: closed</p></div></div><div class="foot-bottom"><span>© ${new Date().getFullYear()} Teebanj Fashion World</span><span>CAD · Secure checkout with Square</span></div></div></footer>`;
}
document.addEventListener("click", (e) => {
  const a = e.target.closest("[data-add]");
  if (a) addToCart(a.dataset.add);
  const w = e.target.closest("[data-wish]");
  if (w) toggleWish(w.dataset.wish);
});
document.addEventListener("DOMContentLoaded", () => {
  renderShell();
  if ("serviceWorker" in navigator)
    navigator.serviceWorker.register("sw.js").catch(() => {});
});

