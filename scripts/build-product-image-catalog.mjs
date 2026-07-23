import fs from "node:fs";

const candidates = JSON.parse(fs.readFileSync("etc/duckduckgo-product-image-candidates.json", "utf8"));
const entities = new Map(JSON.parse(fs.readFileSync("app/demand-entities.json", "utf8")).map((item) => [item.id, item]));
const officialDomains = [
  "drrejuall.com", "drreju-all.kr", "dapharm.com", "dpharm.co.kr", "re4day.co.kr",
  "drdeep.co.kr", "melaxin.com", "doctoralthea.co.kr", "taiguk.co.kr", "ckdpharm.com",
  "sinsinpas.net", "azalea-leopharma.co.kr", "yuhan.co.kr", "dong-wha.co.kr", "culip.co.kr",
  "jw-pharma.co.kr", "easydermbeauty.co.kr", "beautyofjoseon.com", "beautyofjoseonglobal.com",
  "iunik.com", "drvitamall.com", "daycellglobal.com", "villemu.com", "vt-cosmetics.com",
  "globalvt-cosmetics.com", "genabelle.com", "genabelle.co.kr", "rxmecosmetics.com",
  "medipeel.com", "medipeel.co.kr", "elraviecos.com", "fmkcos.com", "fmkcos.co.kr",
  "pyderin.com", "reckitt.com", "strepsils.co.kr", "pharmaresearch.com", "jwbrand.co.kr",
  "daewoong.co.kr", "shinsegaegroupnewsroom.com", "comus.co.kr", "modcol.co.kr",
];
const retailerDomains = [
  "hwahae.co.kr", "hwahae.com", "kurly.com", "kurlyglobal.com", "ssg.com", "shinsegaev.com",
  "musinsa.com", "wconcept.co.kr", "lfmall.co.kr", "coupang.com", "lotteon.com", "amoremall.com",
  "edkshop.com", "pdrnmall.co.kr", "korepharm.com", "k-yak.com", "nicepharm.com", "sspharmacy.co.kr",
  "thepharmacy.co.kr", "yakkok.com", "barkiri.com", "odkshop.com", "beautyboxkorea.com",
  "stylevana.com", "dodoskin.com", "cocomo.sg", "ballagrio.com", "globalvt-cosmetics.com",
];
const host = (value) => {
  try { return new URL(value).hostname.replace(/^(?:www|m)\./, ""); } catch { return ""; }
};
const matches = (hostname, domains) => domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
const words = (value) => value.toLowerCase().replace(/[^\p{L}\p{N}+.]+/gu, " ").trim().split(/\s+/).filter((word) => word.length >= 2);
const compact = (value) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
const relevance = (entity, candidate) => {
  const record = entities.get(entity.id);
  const names = [entity.name, ...(record?.skuNames || []), ...(record?.sourceAliases || [])];
  const targetWords = [...new Set(names.flatMap(words))];
  const haystack = `${candidate.title} ${decodeURI(candidate.sourcePageUrl)}`.toLowerCase();
  const overlap = targetWords.filter((word) => haystack.includes(word)).length;
  const exact = names.some((name) => compact(name).length >= 5 && compact(haystack).includes(compact(name)));
  const hostname = host(candidate.sourcePageUrl);
  return overlap * 12 + (exact ? 100 : 0) + (matches(hostname, officialDomains) ? 15 : 5);
};

const selected = candidates.map((entity) => {
  const eligible = entity.candidates.filter((candidate) => /^https?:\/\//.test(candidate.imageUrl));
  const trusted = eligible.filter((candidate) => matches(host(candidate.sourcePageUrl), [...officialDomains, ...retailerDomains]));
  const candidate = trusted.sort((a, b) => relevance(entity, b) - relevance(entity, a))[0];
  const official = candidate && matches(host(candidate.sourcePageUrl), officialDomains);
  const retailer = candidate && !official;
  return {
    entityId: entity.id,
    productName: entity.name,
    brand: entity.brand,
    sourcePageUrl: candidate?.sourcePageUrl || "",
    sourceImageUrl: candidate?.imageUrl || "",
    sourceTitle: candidate?.title || "",
    sourceHost: candidate ? host(candidate.sourcePageUrl) : "",
    sourceType: official ? "official-brand" : retailer ? "authorized-or-established-retailer" : "unresolved",
    width: candidate?.width || null,
    height: candidate?.height || null,
    matchScore: candidate ? relevance(entity, candidate) : 0,
  };
});

fs.writeFileSync("app/product-assets.json", `${JSON.stringify(selected, null, 2)}\n`);
for (const item of selected) {
  console.log(`${item.sourceType === "unresolved" ? "MISS" : "OK  "} ${item.entityId} | ${item.sourceHost}`);
}
console.log(`resolved ${selected.filter((item) => item.sourceImageUrl).length}/${selected.length}`);
