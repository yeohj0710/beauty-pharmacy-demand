import fs from "node:fs";

const catalog = JSON.parse(fs.readFileSync("app/product-catalog.json", "utf8"));
const existing = JSON.parse(fs.readFileSync("app/demand-entities.json", "utf8"));
const claimed = new Set(existing.flatMap((entity) => entity.skuNames));

const normalize = (name) =>
  name
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b\d+(?:\.\d+)?\s*(?:ml|g|mg|매|포|정|캡슐|튜브|개입|개)\b/gi, " ")
    .replace(/\b어드밴스드\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const keywordsFor = (name) => {
  const normalized = normalize(name);
  const words = normalized.split(" ");
  const core = words.length > 4 ? words.slice(-4).join(" ") : normalized;
  return [...new Set([normalized, core, normalized.replace(/\s+/g, "")])]
    .filter(Boolean)
    .slice(0, 3);
};

const additions = catalog.products
  .filter((name) => !claimed.has(name))
  .map((name, index) => ({
    id: `catalog-${String(index + 1).padStart(3, "0")}`,
    name: normalize(name) || name,
    brand: "",
    category: "",
    skuNames: [name],
    keywords: keywordsFor(name),
    exclude: ["중고", "해외직구"],
    reason: "용량·포장 표기를 제외하고 제품 핵심어와 붙여쓰기를 함께 수집",
  }));

const entities = [...existing, ...additions];
fs.writeFileSync(
  "app/demand-entities.json",
  `${JSON.stringify(entities, null, 2)}\n`,
  "utf8",
);
console.log(`Expanded ${existing.length} entities to ${entities.length}.`);
