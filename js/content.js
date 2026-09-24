/* Editable site content. Each field has a default that is shown until an
   administrator saves a change (Supabase table public.site_content).
   Pages mark elements with data-cms="key" (text), data-cms-paras="key"
   (paragraphs split on blank lines) or data-cms-img="key" (image src). */
const CMS_GROUPS = [
  {
    id: "brand",
    title: "Logo and contact details",
    note: "Used in the header, footer and contact page.",
    fields: [
      { key: "brand.logo", label: "Logo", type: "image", default: "assets/site/teebanj-logo-transparent.png", hint: "A square PNG with a transparent background works best." },
      { key: "contact.phone", label: "Phone number", type: "text", default: "902-593-3718" },
      { key: "contact.whatsapp", label: "WhatsApp number (digits with country code)", type: "text", default: "19025933718" },
      { key: "contact.email", label: "Email address", type: "text", default: "info@teebanjfashionworld.ca" },
      { key: "contact.address", label: "Address", type: "textarea", default: "Moncton, New Brunswick, Canada" },
      { key: "contact.hours", label: "Opening hours", type: "textarea", default: "Monday to Saturday: 10am to 6pm\nSunday: closed" },
      { key: "footer.blurb", label: "Footer description", type: "textarea", default: "African fabrics, ready-to-wear collections and custom designs. Where culture meets style." },
    ],
  },
  {
    id: "announce",
    title: "Top announcement bar",
    fields: [
      { key: "topbar.1", label: "Message 1", type: "text", default: "Custom designs made to measure" },
      { key: "topbar.2", label: "Message 2", type: "text", default: "Secure checkout with Square" },
      { key: "topbar.3", label: "Message 3", type: "text", default: "Questions? Chat on WhatsApp" },
    ],
  },
  {
    id: "hero",
    title: "Homepage slider",
    note: "Slides rotate every few seconds. Use tall cut-out images for the best look.",
    fields: [
      {
        key: "home.slides",
        label: "Slides",
        type: "list",
        max: 6,
        item: [
          { key: "badge", label: "Small label", type: "text" },
          { key: "title", label: "Headline, first line", type: "text" },
          { key: "highlight", label: "Headline, highlighted line", type: "text" },
          { key: "tagline", label: "Tagline", type: "text" },
          { key: "text", label: "Description", type: "textarea" },
          { key: "button", label: "Button text", type: "text" },
          { key: "link", label: "Button link", type: "text" },
          { key: "image", label: "Image", type: "image" },
        ],
        default: [
          { badge: "New season", title: "Wear your", highlight: "culture", tagline: "African prints, made modern", text: "Rich Ankara, Adire and Aso Oke, ready to wear or tailored to you. Discover pieces that feel like home, wherever you are.", button: "Shop now", link: "shop.html", image: "assets/site/hero-model.webp" },
          { badge: "Made for you", title: "Your story,", highlight: "tailored", tagline: "Bespoke and Aso Ebi designs", text: "Share your inspiration, fabric and event date. We design a one-of-a-kind outfit around you.", button: "Start a custom design", link: "custom.html", image: "assets/site/hero-adire.webp" },
          { badge: "Matching looks", title: "Dress", highlight: "together", tagline: "Coordinated couple and family sets", text: "Celebrate weddings, birthdays and special days in prints chosen to match.", button: "Explore the collection", link: "shop.html", image: "assets/site/hero-couple.webp" },
        ],
      },
    ],
  },
  {
    id: "tiles",
    title: "Homepage collection tiles",
    note: "The second tile is the large centre tile.",
    fields: [
      {
        key: "home.tiles",
        label: "Tiles",
        type: "list",
        fixed: true,
        item: [
          { key: "label", label: "Small label", type: "text" },
          { key: "title", label: "Title", type: "text" },
          { key: "subtitle", label: "Subtitle", type: "text" },
          { key: "button", label: "Button text", type: "text" },
          { key: "link", label: "Link", type: "text" },
          { key: "image", label: "Image", type: "image" },
          { key: "fit", label: "Image style", type: "select", options: [["photo", "Photo fills the side"], ["cutout", "Cut-out on transparent background"]] },
        ],
        default: [
          { label: "Women", title: "New", subtitle: "Collection", button: "Shop now", link: "shop.html?cat=women", image: "assets/site/hero-adire.webp", fit: "cutout" },
          { label: "Accessories", title: "The finishing touch", subtitle: "Bags, head ties, shoes and more", button: "Shop now", link: "shop.html?cat=accessories", image: "assets/site/hero-bag.webp", fit: "cutout" },
          { label: "Men", title: "Tailored", subtitle: "For today", button: "Shop now", link: "shop.html?cat=men", image: "assets/products/preview-100472.webp", fit: "photo" },
          { label: "Fabrics", title: "By the yard", subtitle: "Ankara, Adire, Lace", button: "Shop now", link: "shop.html?cat=fabrics", image: "assets/products/preview-100462.webp", fit: "photo" },
          { label: "Made for you", title: "Custom", subtitle: "Aso Ebi and couples", button: "Start a design", link: "custom.html", image: "assets/site/hero-couple.webp", fit: "cutout" },
        ],
      },
    ],
  },
  {
    id: "homeStory",
    title: "Homepage story and newsletter",
    fields: [
      { key: "home.story.eyebrow", label: "Story label", type: "text", default: "More than what you wear" },
      { key: "home.story.title", label: "Story heading", type: "text", default: "Tradition, made personal." },
      { key: "home.story.text", label: "Story text", type: "textarea", default: "From ready-to-wear outfits to bespoke designs and coordinated Aso Ebi attire, we bring African textiles into life's everyday moments and special celebrations." },
      { key: "home.story.image", label: "Story image", type: "image", default: "assets/site/about-couple.jpg" },
      { key: "home.promo.label", label: "Newsletter label", type: "text", default: "Stay in the loop" },
      { key: "home.promo.title", label: "Newsletter heading", type: "text", default: "Be first to new arrivals" },
      { key: "home.promo.text", label: "Newsletter text", type: "text", default: "Collection updates, fabric drops and fashion news." },
      { key: "home.promo.image", label: "Newsletter image", type: "image", default: "assets/site/hero-couple.webp" },
    ],
  },
  {
    id: "about",
    title: "Our story page",
    fields: [
      { key: "about.title", label: "Page title", type: "text", default: "Our story" },
      { key: "about.eyebrow", label: "Label", type: "text", default: "Moncton, Canada. African at heart." },
      { key: "about.heading", label: "Heading", type: "text", default: "Where culture meets style." },
      { key: "about.body", label: "Main text (leave a blank line between paragraphs)", type: "textarea", rows: 8, default: "Teebanj Fashion World brings African textiles and contemporary design together. Based in Moncton, New Brunswick, the business offers ready-to-wear fashion, custom clothing and fabrics.\n\nOur collections celebrate the character of Ankara, Adire, Lace and Aso Oke. Whether you are dressing for an everyday moment, a special occasion or an Aso Ebi celebration, we help you make it personal." },
      { key: "about.subheading", label: "Second heading", type: "text", default: "Made for your story" },
      { key: "about.subtext", label: "Second text", type: "textarea", default: "Explore women's and men's collections, accessories and fabrics, or talk to us about a bespoke design." },
      { key: "about.image", label: "Image", type: "image", default: "assets/site/about-couple.jpg" },
    ],
  },
  {
    id: "custom",
    title: "Custom designs page",
    fields: [
      { key: "custom.title", label: "Page title", type: "text", default: "Made for you" },
      { key: "custom.eyebrow", label: "Label", type: "text", default: "Your occasion. Your expression." },
      { key: "custom.heading", label: "Heading", type: "text", default: "A design with your story in it." },
      { key: "custom.body", label: "Text (leave a blank line between paragraphs)", type: "textarea", rows: 6, default: "From a one-of-a-kind outfit to coordinated Aso Ebi clothing, start with a conversation. Share your inspiration, preferred fabric, measurements and event date.\n\nWe will discuss the design, price and timing before you commit." },
      { key: "custom.image", label: "Image", type: "image", default: "assets/site/hero-couple.webp" },
    ],
  },
  {
    id: "contact",
    title: "Contact page",
    fields: [
      { key: "contact.title", label: "Page title", type: "text", default: "Let's talk" },
      { key: "contact.heading", label: "Contact card heading", type: "text", default: "Here for you." },
      {
        key: "contact.faq",
        label: "Questions and answers",
        type: "list",
        max: 12,
        item: [
          { key: "q", label: "Question", type: "text" },
          { key: "a", label: "Answer", type: "textarea" },
        ],
        default: [
          { q: "Delivery", a: "Available destinations, delivery charges and taxes are shown during checkout. For international or custom orders, contact us before ordering." },
          { q: "Custom pieces", a: "Tell us about your design, fabric, measurements and event date. We will discuss availability and a quote with you." },
          { q: "Returns", a: "Please contact us before returning an item. Sale, worn, washed, damaged and personalised items may not be eligible. If an item arrives damaged or incorrect, contact us within seven days." },
          { q: "Payment and stock", a: "Payments are processed securely by Square. Adding an item to your bag does not reserve it. We confirm your order after successful payment." },
        ],
      },
    ],
  },
];
const CMS_FIELDS = Object.fromEntries(
  CMS_GROUPS.flatMap((g) => g.fields).map((f) => [f.key, f]),
);
function cms(key) {
  const saved = (window.TEEBANJ_CONTENT || {})[key];
  const field = CMS_FIELDS[key];
  if (saved === undefined || saved === null || saved === "") return field?.default ?? "";
  if (field?.type === "list" && !Array.isArray(saved)) return field.default;
  return saved;
}
// Only site-relative paths or https URLs are used for links and images.
function safeUrl(v, fallback = "#") {
  const s = String(v || "").trim();
  return /^(https:\/\/|[a-z0-9][a-z0-9_./?=&%#-]*$)/i.test(s) && !/^javascript:/i.test(s) ? s : fallback;
}
function applyCms(root = document) {
  root.querySelectorAll("[data-cms]").forEach((el) => (el.textContent = cms(el.dataset.cms)));
  root.querySelectorAll("[data-cms-img]").forEach((el) => (el.src = safeUrl(cms(el.dataset.cmsImg), el.getAttribute("src"))));
  root.querySelectorAll("[data-cms-paras]").forEach((el) => {
    el.replaceChildren(
      ...String(cms(el.dataset.cmsParas))
        .split(/\n\s*\n/)
        .filter((t) => t.trim())
        .map((t) => Object.assign(document.createElement("p"), { textContent: t.trim() })),
    );
  });
}
