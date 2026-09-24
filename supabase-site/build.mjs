import { readFile, writeFile, mkdir, cp, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "esbuild";
const root = fileURLToPath(new URL("../", import.meta.url));
const out = fileURLToPath(new URL("./dist/", import.meta.url));
await mkdir(out, { recursive: true });
// Explicit allowlist: never copy PHP, local configuration, .git, or credentials.
for (const dir of ["assets", "css", "js"])
  await cp(path.join(root, dir), path.join(out, dir), {
    recursive: true,
    filter: (src) => !src.endsWith(path.join("js", "api.js")),
  });
for (const name of await readdir(root)) {
  if (!name.endsWith(".html")) continue;
  let html = await readFile(path.join(root, name), "utf8");
  html = html
    .replace(
      /<script src="(?:api\/products.php|js\/(?:products|main|api).js)"><\/script>\s*/g,
      "",
    )
    .replaceAll("DOMContentLoaded", "teebanj:ready")
    .replace(
      "</body>",
      '<script defer src="js/supabase.js"></script>\n</body>',
    );
  if (name === "account.html")
    html = html.replace(
      /Guest checkout orders can be viewed using the order link in the same\s+browser used for payment\./,
      "Sign in to view orders placed through your account.",
    );
  if (name === "checkout.html")
    html = html
      .replace('"submittedCart"', '"submittedCart:" + r.id')
      .replace(
        "!s.checkout_enabled || !cart.length || !s.provinces.length;",
        "!s.checkout_enabled || !s.customer || !cart.length || !s.provinces.length;",
      )
      .replace(
        "if (s.customer) {",
        'if (s.checkout_enabled && !s.customer) document.getElementById("checkoutStatus").innerHTML = \'Please <a href="account.html">sign in</a> before checkout.\';\n          if (s.customer) {',
      );
  if (name === "order.html")
    html = html
      .replace(
        'store.get("clearedOrder", null) !== ref',
        '!store.get("clearedOrder:" + ref, false)',
      )
      .replace(
        'store.get("submittedCart", [])',
        'store.get("submittedCart:" + ref, [])',
      )
      .replace(
        'store.set("clearedOrder", ref)',
        'store.set("clearedOrder:" + ref, true)',
      )
      .replace(
        'store.set("checkoutAttempt", null);',
        'if (store.get("checkoutAttempt", {})?.id === ref.replaceAll("-", "")) store.set("checkoutAttempt", null);',
      );
  await writeFile(path.join(out, name), html);
}
let main = await readFile(path.join(out, "js/main.js"), "utf8");
main = main
  .replaceAll("DOMContentLoaded", "teebanj:ready")
  .replace(
    /if \("serviceWorker" in navigator\)\s*navigator.serviceWorker.register\("sw.js"\).catch\(\(\) => \{\}\);/,
    "",
  );
await writeFile(path.join(out, "js/main.js"), main);
await cp(
  path.join(root, "manifest.webmanifest"),
  path.join(out, "manifest.webmanifest"),
);
await build({
  entryPoints: [fileURLToPath(new URL("./client.js", import.meta.url))],
  bundle: true,
  minify: true,
  format: "iife",
  outfile: path.join(out, "js/supabase.js"),
  target: ["es2022"],
});
const hosting = JSON.parse(
  await readFile(new URL("./vercel.json", import.meta.url), "utf8"),
);
await writeFile(
  path.join(out, "vercel.json"),
  JSON.stringify({ framework: null, headers: hosting.headers }, null, 2),
);
console.log("Built Supabase storefront in supabase-site/dist");
