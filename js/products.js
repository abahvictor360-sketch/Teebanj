/* Live catalogue supplied by api/products.php. No fabricated stock or prices. */
const CATEGORIES = [
  {
    slug: "women",
    name: "Women",
    blurb: "Modern silhouettes, African spirit",
    tint: "#f8e5df",
  },
  {
    slug: "men",
    name: "Men",
    blurb: "Tradition, tailored for today",
    tint: "#e6ece5",
  },
  {
    slug: "fabrics",
    name: "Fabrics",
    blurb: "Ankara, Adire, Lace & Aso Oke",
    tint: "#f3e9d5",
  },
  {
    slug: "accessories",
    name: "Accessories",
    blurb: "The finishing touch",
    tint: "#eee6ee",
  },
];
const PRODUCTS =
  window.TEEBANJ_READY === true
    ? window.TEEBANJ_CATALOG || []
    : window.TEEBANJ_PREVIEW || [];
const SIZES = {};
const escapeHtml = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (n) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(
    Number(n) || 0,
  );
const img = (p) =>
  p.image && /^(https:\/\/|assets\/products\/)/.test(p.image)
    ? p.image
    : "assets/site/product-placeholder.svg";
const catName = (slug) =>
  CATEGORIES.find((c) => c.slug === slug)?.name || "Collection";
