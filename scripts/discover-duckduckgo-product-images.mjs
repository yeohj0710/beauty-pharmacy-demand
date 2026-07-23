import fs from "node:fs";

const entities = JSON.parse(fs.readFileSync("app/demand-entities.json", "utf8"));
const outPath = process.argv[2] || "etc/duckduckgo-product-image-candidates.json";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const rows = [];

for (const [index, entity] of entities.entries()) {
  const query = `${entity.brand ? `${entity.brand} ` : ""}${entity.name} 제품`;
  const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`;
  const page = await fetch(searchUrl, { headers: { "user-agent": "Mozilla/5.0" } }).then((response) => response.text());
  const token = page.match(/vqd=["']?([\d-]+)/)?.[1];
  let candidates = [];
  if (token) {
    const apiUrl = `https://duckduckgo.com/i.js?l=kr-ko&o=json&q=${encodeURIComponent(query)}&vqd=${token}&f=,,,&p=1`;
    const response = await fetch(apiUrl, {
      headers: { "user-agent": "Mozilla/5.0", referer: "https://duckduckgo.com/" },
    });
    if (response.ok) {
      const result = await response.json();
      candidates = (result.results || []).slice(0, 30).map(({ title, url, image, width, height }) => ({
        title, sourcePageUrl: url, imageUrl: image, width, height,
      }));
    }
  }
  rows.push({ id: entity.id, name: entity.name, brand: entity.brand, query, candidates });
  fs.writeFileSync(outPath, `${JSON.stringify(rows, null, 2)}\n`);
  process.stdout.write(`${index + 1}/${entities.length} ${entity.name}: ${candidates.length}\n`);
  await sleep(350);
}
