const url = process.argv[2];
if (!url) throw new Error("usage: node scripts/inspect-official-product-page.mjs <url>");

const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
const html = await response.text();
const absolute = (value) => {
  try { return new URL(value, url).href; } catch { return ""; }
};
const rows = [];
for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
  const tag = match[0];
  const attr = (name) => tag.match(new RegExp(`${name}=["']([^"']*)`, "i"))?.[1] || "";
  const src = attr("src") || attr("data-src") || attr("data-original");
  if (!src) continue;
  rows.push({
    src: absolute(src),
    alt: attr("alt"),
    className: attr("class"),
  });
}
const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1].replace(/<[^>]+>/g, "").trim() || "";
console.log(JSON.stringify({ url, title, images: rows }, null, 2));
