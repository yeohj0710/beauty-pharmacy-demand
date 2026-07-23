import fs from "node:fs";

const entities = JSON.parse(fs.readFileSync("app/demand-entities.json", "utf8"));
const outPath = process.argv[2] || "etc/official-product-page-candidates.json";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const decode = (value) => value
  .replaceAll("&amp;", "&")
  .replaceAll("&#x2F;", "/")
  .replaceAll("&quot;", '"');

const output = [];
for (const [index, entity] of entities.entries()) {
  const query = `${entity.brand ? `${entity.brand} ` : ""}${entity.name} 공식 제품`;
  const url = `https://search.brave.com/search?q=${encodeURIComponent(query)}&source=web&spellcheck=0`;
  const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
  const html = await response.text();
  const links = [];
  for (const match of html.matchAll(/<a[^>]+href=["'](https?:\/\/[^"']+)["']/gi)) {
    const href = decode(match[1]);
    if (/search\.brave\.com|cdn\.search\.brave\.com/.test(href) || links.includes(href)) continue;
    links.push(href);
  }
  output.push({ id: entity.id, name: entity.name, brand: entity.brand, query, links: links.slice(0, 10) });
  process.stdout.write(`${index + 1}/${entities.length} ${entity.name}: ${links.length}\n`);
  await sleep(180);
}
fs.writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`);
