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
const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  heart: '<path d="M12 20s-7-4.4-9.2-8.6C1.2 8.3 3 4.5 6.6 4.5c2.1 0 3.4 1.2 4.4 2.6 1-1.4 2.3-2.6 4.4-2.6 3.6 0 5.4 3.8 3.8 6.9C19 15.6 12 20 12 20z"/>',
  bag: '<path d="M5 8h14l-1.2 12H6.2z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  scissors: '<circle cx="6" cy="7" r="2.5"/><circle cx="6" cy="17" r="2.5"/><path d="M8 8.5 20 17M8 15.5 20 7"/>',
  shield: '<path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z"/><path d="m9 12 2 2 4-4"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8M8 13h5"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  box: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.8-4M4 5v4h4M4 13a8 8 0 0 0 14.8 4M20 19v-4h-4"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  store: '<path d="M4 9 5.5 4h13L20 9M4 9h16v11H4zM4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M10 20v-5h4v5"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
  cash: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v.01M18 15v.01"/>',
  truck: '<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>',
};
const icon = (name, cls = "ico") =>
  `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`;
function toggleWish(id) {
  wishlist = wishlist.includes(id)
    ? wishlist.filter((x) => x !== id)
    : [...wishlist, id];
  store.set("wishlist", wishlist);
  document
    .querySelectorAll("[data-wish]")
    .forEach((b) => b.dataset.wish === id && b.classList.toggle("on", wishlist.includes(id)));
  document
    .querySelectorAll("[data-wish-count]")
    .forEach((el) => (el.textContent = wishlist.length));
  toast(wishlist.includes(id) ? "Saved to your wishlist" : "Removed from your wishlist");
}
function productBadge(p) {
  if (p.preview) return '<span class="pc-badge soft">Enquire</span>';
  if (p.stock < 1) return '<span class="pc-badge out">Sold out</span>';
  if (p.stock <= 3) return `<span class="pc-badge soft">Only ${Number(p.stock)} left</span>`;
  return "";
}
function productCard(p) {
  const href = `product.html?id=${encodeURIComponent(p.id)}`;
  const name = escapeHtml(p.name);
  const action = p.preview
    ? `<a class="btn btn-dark" href="contact.html">Enquire</a>`
    : `<button class="btn btn-dark" data-add="${escapeHtml(p.id)}" ${p.stock < 1 ? "disabled" : ""}>${p.stock < 1 ? "Sold out" : "Add to bag"}</button>`;
  return `<article class="product-card"><div class="pc-media">${productBadge(p)}<a href="${href}" tabindex="-1"><img src="${escapeHtml(img(p))}" alt="${name}" loading="lazy"></a><button class="wish${wishlist.includes(p.id) ? " on" : ""}" data-wish="${escapeHtml(p.id)}" aria-label="Save ${name} to wishlist">${icon("heart")}</button><div class="pc-quick">${action}</div></div><div class="pc-body"><span class="pc-cat">${catName(p.cat)}</span><a class="pc-name" href="${href}">${name}</a><span class="pc-price">${money(p.price)}</span>${p.preview ? '<span class="pc-note">Ask about sizes and colours</span>' : ""}</div></article>`;
}
function renderGrid(el, list) {
  if (el)
    el.innerHTML = list.length
      ? list.map(productCard).join("")
      : '<p class="empty">Our online collection is being updated. Please <a href="contact.html">contact us</a> for available pieces.</p>';
}
const brand = '<a class="logo supplied-logo" href="index.html" aria-label="Teebanj Fashion World home"><span class="supplied-logo-window"><img src="assets/site/teebanj-logo-transparent.png" alt="Teebanj Fashion World, African roots, global style" width="1254" height="1254"></span></a>';
function renderShell() {
  const h = document.querySelector('[data-shell="header"]');
  const here = location.pathname.split("/").pop() || "index.html";
  if (h) {
    h.innerHTML = `<div class="topbar perkbar"><span>${icon("scissors")}<b>Custom designs</b> made to measure</span><span>${icon("shield")}<b>Secure checkout</b> with Square</span><span>${icon("chat")}<b>Questions?</b> <a href="${waLink()}" target="_blank" rel="noopener">Chat on WhatsApp</a></span></div><header class="site-header"><div class="header-inner">${brand}<nav class="nav" id="nav" aria-label="Main navigation"><button class="icon-btn nav-close" id="navClose" aria-label="Close menu">${icon("close")}</button>${[
      ["Home", "index.html"],
      ["Shop", "shop.html"],
      ["Our story", "about.html"],
      ["Custom designs", "custom.html"],
      ["Contact", "contact.html"],
    ]
      .map(([t, u]) => `<a href="${u}" ${here === u ? 'class="active" aria-current="page"' : ""}>${t}</a>`)
      .join("")}</nav><div class="header-actions"><button class="icon-btn" id="searchToggle" aria-label="Search" aria-expanded="false" aria-controls="searchPanel">${icon("search")}</button><a class="icon-btn hide-sm" href="account.html" aria-label="Your account">${icon("user")}</a><a class="icon-btn" href="wishlist.html" aria-label="Wishlist">${icon("heart")}<span class="badge" data-wish-count>${wishlist.length}</span></a><a class="icon-btn bag-link" href="cart.html" aria-label="Shopping bag">${icon("bag")}<span class="badge" data-cart-count>${cartCount()}</span></a><button class="icon-btn menu-toggle" id="menuToggle" aria-label="Open menu" aria-expanded="false" aria-controls="nav">${icon("menu")}</button></div></div><div class="search-panel" id="searchPanel"><form action="shop.html" role="search"><input type="search" name="q" placeholder="Search dresses, Ankara, head ties" aria-label="Search products"><button class="btn btn-primary" type="submit">Search</button></form></div></header>`;
    const nav = document.getElementById("nav");
    const toggle = document.getElementById("menuToggle");
    const setNav = (open) => {
      nav.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
      document.querySelector(".nav-scrim")?.remove();
      if (open) {
        const scrim = document.createElement("div");
        scrim.className = "nav-scrim";
        scrim.addEventListener("click", () => setNav(false));
        document.body.append(scrim);
      }
    };
    toggle.addEventListener("click", () => setNav(!nav.classList.contains("open")));
    document.getElementById("navClose").addEventListener("click", () => setNav(false));
    document.addEventListener("keydown", (e) => e.key === "Escape" && setNav(false));
    document.getElementById("searchToggle").addEventListener("click", (e) => {
      const panel = document.getElementById("searchPanel");
      const open = panel.classList.toggle("open");
      e.currentTarget.setAttribute("aria-expanded", String(open));
      if (open) panel.querySelector("input").focus();
    });
  }
  const f = document.querySelector('[data-shell="footer"]');
  if (f)
    f.innerHTML = `<footer class="site-footer"><div class="wrap"><div class="foot-grid"><div><span class="logo-plate">${brand}</span><p>African fabrics, ready-to-wear collections and custom designs. Where culture meets style.</p></div><div><h4>Shop</h4><ul>${CATEGORIES.map((c) => `<li><a href="shop.html?cat=${c.slug}">${c.name}</a></li>`).join("")}<li><a href="wishlist.html">Wishlist</a></li></ul></div><div><h4>Customer care</h4><ul><li><a href="account.html">My account and orders</a></li><li><a href="contact.html#faq">Shipping and returns</a></li><li><a href="custom.html">Custom designs</a></li><li><a href="privacy.html">Privacy</a></li></ul></div><div><h4>Visit or reach us</h4><div class="foot-contact"><span>${icon("pin")}Moncton, New Brunswick, Canada</span><a href="tel:+19025933718">${icon("phone")}902-593-3718</a><a href="mailto:info@teebanjfashionworld.ca">${icon("mail")}info@teebanjfashionworld.ca</a><a href="${waLink()}" target="_blank" rel="noopener">${icon("chat")}WhatsApp us</a></div><p>Monday to Saturday: 10am to 6pm<br>Sunday: closed</p></div></div><div class="foot-bottom"><span>© ${new Date().getFullYear()} Teebanj Fashion World. All rights reserved.</span><span class="pay-note">${icon("lock")}Prices in CAD. Secure payments by Square.</span></div></div></footer>`;
}
document.addEventListener("click", (e) => {
  const a = e.target.closest("[data-add]");
  if (a) addToCart(a.dataset.add);
  const w = e.target.closest("[data-wish]");
  if (w) toggleWish(w.dataset.wish);
  const t = e.target.closest(".password-toggle");
  if (t) {
    const input = t.parentElement.querySelector("input");
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    t.setAttribute("aria-label", show ? "Hide password" : "Show password");
    t.innerHTML = icon(show ? "eyeOff" : "eye");
  }
});
document.addEventListener("DOMContentLoaded", () => {
  renderShell();
  if ("serviceWorker" in navigator)
    navigator.serviceWorker.register("sw.js").catch(() => {});
});

