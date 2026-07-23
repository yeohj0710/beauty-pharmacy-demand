// 시그니처 품목 이미지 후보에서 공식 브랜드/제조사 → 주요 판매몰 순으로 선별한다.
// 블로그·뉴스·해외 리셀러·가격비교 사이트는 제외한다.
import fs from "node:fs";

const rows = JSON.parse(
  fs.readFileSync("etc/signature-image-candidates.json", "utf8"),
);
// 후보 수집 과정에서 확인한 실제 공식 도메인 보정
const EXTRA_OFFICIAL = {
  "sig-ludient-recode": ["theludient.co.kr"],
  "sig-medicube-mask": ["themedicube.co.kr"],
  "sig-skin1004-ampoule": ["skin1004korea.com"],
};
const MALLS = [
  "hwahae.co.kr", "hwahae.com", "oliveyoung.co.kr", "globaloliveyoung.com",
  "ssg.com", "lotteon.com", "coupang.com", "kurly.com", "amoremall.com",
  "musinsa.com", "wconcept.co.kr", "elandmall.co.kr", "k-yak.com",
  "thepharmacy.co.kr", "barkiri.com", "yakkok.com", "nicepharm.com",
];
const host = (value) => {
  try {
    return new URL(value).hostname.replace(/^(?:www|m|shop|store|image|img|cdn)\./, "");
  } catch {
    return "";
  }
};
const endsWithAny = (hostname, domains) =>
  domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));

const picked = [];
const unresolved = [];
for (const row of rows) {
  const official = [...row.official, ...(EXTRA_OFFICIAL[row.id] ?? [])];
  const scored = row.candidates
    .map((candidate) => {
      const pageHost = host(candidate.sourcePageUrl);
      const imageHost = host(candidate.imageUrl);
      const isOfficial =
        endsWithAny(pageHost, official) || endsWithAny(imageHost, official);
      const isMall = endsWithAny(pageHost, MALLS) || endsWithAny(imageHost, MALLS);
      const shortest = Math.min(candidate.width || 0, candidate.height || 0);
      const ratio = candidate.width && candidate.height
        ? Math.min(candidate.width, candidate.height) /
          Math.max(candidate.width, candidate.height)
        : 0;
      return {
        ...candidate,
        pageHost,
        sourceType: isOfficial ? "official-brand" : isMall ? "retailer" : "other",
        // 공식 > 판매몰, 그 안에서 정사각형에 가깝고 큰 이미지 우선
        score:
          (isOfficial ? 1000 : isMall ? 500 : 0) +
          ratio * 120 +
          Math.min(shortest, 1200) / 12,
        shortest,
      };
    })
    .filter((candidate) => candidate.sourceType !== "other" && candidate.shortest >= 300)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best) {
    unresolved.push(row.id);
    continue;
  }
  picked.push({
    entityId: row.id,
    productName: row.name,
    brand: row.brand,
    sourcePageUrl: best.sourcePageUrl,
    sourceImageUrl: best.imageUrl,
    sourceTitle: best.title,
    sourceType: best.sourceType,
    localImagePath: "",
  });
  console.log(
    `${best.sourceType === "official-brand" ? "공식" : "판매몰"} ${row.name} → ${best.pageHost} (${best.width}x${best.height})`,
  );
}

fs.writeFileSync(
  "etc/signature-image-picks.json",
  `${JSON.stringify(picked, null, 2)}\n`,
);
console.log(`\n선별 ${picked.length}건 / 미해결 ${unresolved.length}건`, unresolved);
