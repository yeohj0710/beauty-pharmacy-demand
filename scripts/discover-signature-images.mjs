// 시그니처 품목(약국 실판매 상위 품목)의 공식 이미지 후보를 수집한다.
// DuckDuckGo 이미지 검색 결과에서 공식 도메인 우선으로 후보를 정렬해 저장한다.
import fs from "node:fs";

const items = JSON.parse(
  fs.readFileSync("scripts/signature-product-sources.json", "utf8"),
);
const outPath = process.argv[2] || "etc/signature-image-candidates.json";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const host = (value) => {
  try {
    return new URL(value).hostname.replace(/^(?:www|m|shop|store)\./, "");
  } catch {
    return "";
  }
};
const TRUSTED = [
  "hwahae.com", "hwahae.co.kr", "oliveyoung.co.kr", "globaloliveyoung.com",
  "kurly.com", "ssg.com", "lotteon.com", "coupang.com", "amoremall.com",
  "musinsa.com", "wconcept.co.kr", "barkiri.com", "thepharmacy.co.kr",
  "yakkok.com", "k-yak.com", "nicepharm.com", "stylevana.com", "olive-young.com",
];
const rows = [];

for (const [index, item] of items.entries()) {
  let candidates = [];
  try {
    const page = await fetch(
      `https://duckduckgo.com/?q=${encodeURIComponent(item.query)}&iax=images&ia=images`,
      { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20_000) },
    ).then((response) => response.text());
    const token = page.match(/vqd=["']?([\d-]+)/)?.[1];
    if (token) {
      const response = await fetch(
        `https://duckduckgo.com/i.js?l=kr-ko&o=json&q=${encodeURIComponent(item.query)}&vqd=${token}&f=,,,&p=1`,
        {
          headers: { "user-agent": "Mozilla/5.0", referer: "https://duckduckgo.com/" },
          signal: AbortSignal.timeout(20_000),
        },
      );
      if (response.ok) {
        const result = await response.json();
        candidates = (result.results || []).slice(0, 40).map((entry) => ({
          title: entry.title,
          sourcePageUrl: entry.url,
          imageUrl: entry.image,
          width: entry.width,
          height: entry.height,
        }));
      }
    }
  } catch (error) {
    console.error(`ERR  ${item.id} ${error.message}`);
  }
  const rank = (candidate) => {
    const pageHost = host(candidate.sourcePageUrl);
    const imageHost = host(candidate.imageUrl);
    const isOfficial = item.official.some(
      (domain) => pageHost.endsWith(domain) || imageHost.endsWith(domain),
    );
    const isTrusted = TRUSTED.some(
      (domain) => pageHost.endsWith(domain) || imageHost.endsWith(domain),
    );
    const square = candidate.width && candidate.height
      ? Math.min(candidate.width, candidate.height) / Math.max(candidate.width, candidate.height)
      : 0;
    return (isOfficial ? 100 : isTrusted ? 50 : 0) + square * 10;
  };
  candidates.sort((a, b) => rank(b) - rank(a));
  const best = candidates[0];
  rows.push({ ...item, candidates: candidates.slice(0, 12) });
  fs.writeFileSync(outPath, `${JSON.stringify(rows, null, 2)}\n`);
  console.log(
    `${index + 1}/${items.length} ${item.name}: ${candidates.length}건` +
      (best ? ` → ${host(best.sourcePageUrl)} (${best.width}x${best.height})` : " → 없음"),
  );
  await sleep(400);
}
