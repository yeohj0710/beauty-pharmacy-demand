// 재수집 작업 계획기.
// 현재 signals.json / signal-quality.json 상태를 읽어 "지금 무엇을 다시
// 수집해야 하는지"를 우선순위대로 출력한다. 명단을 문서에 적어두면 금방
// 낡으므로, 조사 담당(사람·에이전트)은 매번 이 스크립트를 실행해 그날의
// 작업 목록을 받는다.
//
// 사용법:
//   npm run plan:recollection          사람이 읽는 작업 지시
//   npm run plan:recollection -- --json  기계가 읽는 JSON

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const readJson = (name) =>
  JSON.parse(fs.readFileSync(path.join(root, "app", name), "utf8"));

const signals = readJson("signals.json");
const quality = readJson("signal-quality.json");
const products = signals.products;
const asJson = process.argv.includes("--json");

const FRESH_DAYS = 30; // 이 기간이 지나면 전체 재수집 권장
const SOCIAL = [
  ["youtube", "YouTube"],
  ["instagram", "Instagram"],
  ["tiktok", "TikTok"],
];

const now = new Date();
const collectedAt = new Date(signals.collectedAt);
const ageDays = Math.floor((now - collectedAt) / 86_400_000);

// P0 — 수집이 실패해 값이 비어 있는 채널. 재시도하면 바로 메워진다.
const failures = [];
for (const product of products) {
  for (const platform of ["youtube", "instagram", "tiktok", "naver", "google"]) {
    const status = product[platform]?.status;
    if (["rate_limited", "error", "blocked"].includes(status)) {
      failures.push({ product: product.name, platform, status });
    }
  }
}

// P1 — 대표 검색어가 부족한 제품. 검색어를 늘려야 표본이 늘어난다.
const keywordGaps = products
  .filter((product) => (product.keywords || []).length < 2)
  .map((product) => ({
    product: product.name,
    keywordCount: (product.keywords || []).length,
    keywords: product.keywords || [],
    skuNames: product.skuNames || [],
  }));

// P2 — 등록된 검색어를 다 쓰지 않은 채널. 남은 검색어로 재검색할 여지가 있다.
const underQueried = [];
for (const product of products) {
  const keywordCount = (product.keywords || []).length;
  if (keywordCount < 2) continue; // P1에서 먼저 처리
  for (const [platform, label] of SOCIAL) {
    const source = product[platform];
    if (!source) continue;
    const attempted = (source.attemptedQueries || []).length;
    if (attempted > 0 && attempted < keywordCount) {
      underQueried.push({
        product: product.name,
        platform,
        label,
        attempted,
        keywordCount,
        unused: (product.keywords || []).filter(
          (keyword) => !(source.attemptedQueries || []).includes(keyword),
        ),
      });
    }
  }
}

// P3 — 수집은 됐지만 기간 내 표본이 5개 미만이라 신뢰도가 low인 채널.
const thinSamples = [];
for (const product of products) {
  const entry = quality.products[product.name] ?? {};
  for (const [platform, label] of SOCIAL) {
    const channel = entry[platform];
    if (!channel) continue;
    if (channel.adjustedSampleCount > 0 && channel.adjustedSampleCount < 5) {
      thinSamples.push({
        product: product.name,
        platform,
        label,
        samples: channel.adjustedSampleCount,
        stale: channel.staleCount ?? 0,
      });
    }
  }
}

const verdicts = Object.values(quality.products).reduce((acc, entry) => {
  acc[entry.verdict] = (acc[entry.verdict] || 0) + 1;
  return acc;
}, {});

const plan = {
  dataCollectedAt: signals.collectedAt,
  ageDays,
  needsFullRefresh: ageDays >= FRESH_DAYS,
  products: products.length,
  verdicts,
  systemicIssues: quality.meta?.systemicIssues ?? [],
  tasks: {
    p0Failures: failures,
    p1KeywordGaps: keywordGaps,
    p2UnderQueried: underQueried,
    p3ThinSamples: thinSamples,
  },
};

if (asJson) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

const groupByPlatform = (rows) => {
  const map = new Map();
  for (const row of rows) {
    const key = row.label ?? row.platform;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
};

const listProducts = (rows, limit = 12) => {
  const names = rows.map((row) => row.product);
  const shown = names.slice(0, limit).join(" · ");
  return names.length > limit
    ? `${shown} … 외 ${names.length - limit}개`
    : shown;
};

console.log("=".repeat(72));
console.log("재수집 작업 계획");
console.log("=".repeat(72));
console.log(`데이터 기준   ${signals.collectedAt} (${ageDays}일 경과)`);
console.log(`제품          ${products.length}개`);
console.log(
  `판정          판단 가능 ${verdicts.usable ?? 0} · 주의 ${verdicts.caution ?? 0} · 표본 부족 ${verdicts.insufficient ?? 0}`,
);
if (plan.needsFullRefresh) {
  console.log(
    `\n[전체 갱신] 마지막 수집으로부터 ${ageDays}일 경과 — 5개 채널 전체 재수집 권장`,
  );
} else {
  console.log(
    `\n[전체 갱신] 불필요 (${FRESH_DAYS}일 기준, ${FRESH_DAYS - ageDays}일 남음)`,
  );
}
for (const issue of plan.systemicIssues) console.log(`[공통 한계] ${issue}`);

console.log(`\n── P0 수집 실패 재시도 (${failures.length}건) ──`);
if (!failures.length) console.log("  없음");
for (const [label, rows] of groupByPlatform(failures)) {
  console.log(`  ${label} ${rows.length}건: ${listProducts(rows)}`);
}

console.log(`\n── P1 대표 검색어 보강 (${keywordGaps.length}개 제품) ──`);
if (!keywordGaps.length) console.log("  없음");
for (const gap of keywordGaps) {
  console.log(
    `  ${gap.product} — 현재 검색어 ${gap.keywordCount}개 [${gap.keywords.join(", ")}] / SKU: ${gap.skuNames.join(", ")}`,
  );
}
if (keywordGaps.length) {
  console.log(
    "  → 소비자 통칭·별칭을 조사해 keywords를 2~4개로 늘린 뒤 해당 제품 소셜 채널을 재수집한다.",
  );
}

console.log(`\n── P2 미적용 검색어로 재검색 (${underQueried.length}건) ──`);
if (!underQueried.length) console.log("  없음");
for (const [label, rows] of groupByPlatform(underQueried)) {
  console.log(`  ${label} ${rows.length}건: ${listProducts(rows)}`);
}

console.log(`\n── P3 표본 부족 채널 (${thinSamples.length}건, 기간 내 5개 미만) ──`);
if (!thinSamples.length) console.log("  없음");
for (const [label, rows] of groupByPlatform(thinSamples)) {
  console.log(`  ${label} ${rows.length}건: ${listProducts(rows)}`);
}

console.log(`\n${"=".repeat(72)}`);
console.log("작업 절차: docs/recollection-runbook.md");
console.log("완료 후:   npm run validate:signals && npm run audit:signals && npm run test:unit");
console.log("=".repeat(72));
