import fs from "node:fs";

const entities = JSON.parse(fs.readFileSync("app/demand-entities.json", "utf8"));
const outPath = process.argv[2] || "etc/official-product-image-candidates.json";
const start = Number(process.argv[3] || 0);
const end = Number(process.argv[4] || entities.length);
const delayMs = Number(process.argv[5] || 450);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const unescapeJs = (value) => value
  .replace(/\\u([0-9a-f]{4})/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
  .replaceAll("\\/", "/")
  .replaceAll('\\"', '"')
  .replaceAll("\\&", "&");

const output = [];
for (const [index, entity] of entities.entries()) {
  if (index < start || index >= end) continue;
  const query = `${entity.brand ? `${entity.brand} ` : ""}${entity.name} 공식몰 제품 이미지`;
  const url = `https://search.brave.com/images?q=${encodeURIComponent(query)}&source=web&safesearch=strict`;
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0 Safari/537.36",
      "accept-language": "ko-KR,ko;q=0.9,en;q=0.8",
    },
  });
  const html = await response.text();
  const candidates = [];
  for (const match of html.matchAll(/\{title:"([\s\S]*?)",url:"(https?:[\s\S]*?)",is_source_[\s\S]*?thumbnail:\{[\s\S]*?original:"(https?:[\s\S]*?)",resized:/g)) {
    const candidate = {
      title: unescapeJs(match[1]),
      sourcePageUrl: unescapeJs(match[2]),
      imageUrl: unescapeJs(match[3]),
    };
    if (!candidates.some((item) => item.imageUrl === candidate.imageUrl)) candidates.push(candidate);
  }
  output.push({ id: entity.id, name: entity.name, brand: entity.brand, query, candidates: candidates.slice(0, 12) });
  fs.writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`);
  process.stdout.write(`${index + 1}/${entities.length} ${entity.name}: ${candidates.length}\n`);
  await sleep(delayMs);
}
