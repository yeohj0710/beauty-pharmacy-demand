// 조사 브리핑 생성기.
// 현재 signals.json / signal-quality.json 상태를 읽어 "지금 무엇을 다시
// 수집해야 하는지"를 우선순위대로 출력한다. 명단을 문서에 적어두면 금방
// 낡으므로, 조사 담당(사람·에이전트)은 매번 이 스크립트를 실행해 그날의
// 작업 목록을 받는다.
//
// 출력 하나로 작업이 끝나도록 조사 규칙과 완료 파이프라인까지 함께 찍는다.
// 저장소를 처음 보는 에이전트가 이 명령만 실행해도 올바르게 수집할 수 있어야
// 한다.
//
// 사용법:
//   npm run brief                 조사 규칙 + 작업 목록 (기본)
//   npm run brief -- --json       기계가 읽는 JSON

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
console.log("제품 수요 조사 브리핑");
console.log("=".repeat(72));
console.log(`
[무엇을] 약국·뷰티 제품 ${products.length}개의 공개 웹 관심 신호를 5개 채널에서 수집한다.
         네이버 DataLab(1년) · Google Trends(12개월) · YouTube(365일)
         · Instagram(180일) · TikTok(180일)
         검색어별 상위 20개를 검토해 관련성 통과 자연 결과를 최대 10개 채택한다.
         내부 매출·판매량·이익 데이터는 읽지도 저장하지도 않는다.

[규칙]   1. 화면에 보이는 숫자만 기록한다. 안 보이면 null이며 0이 아니다.
         2. 대상 제품을 특정할 수 없는 범용 콘텐츠(예: "PDRN 10종 비교")는 채택하지
            않는다. 애매하면 뺀다. 표본을 억지로 채우면 점수가 오염된다.
         3. 광고·협찬·공식 계정은 지우지 말고 classification으로 분리한다.
         4. 채택 항목마다 원본 URL(https) · ISO 게시일(publishedAt) · 수집 시각을 남긴다.
         5. 시도한 검색어를 attemptedQueries에 전부 기록한다.
         6. totals는 items 합과 일치하고 acceptedCount == items.length여야 한다.
         7. 이번에 재수집한 채널 레코드만 교체한다. 다른 채널·제품은 건드리지 않는다.
            작업 후 루트 collectedAt을 완료 시각으로, KST 오프셋(+09:00)으로 갱신한다.
         8. 로그인·CAPTCHA 화면에서는 우회하지 말고 멈춰 사용자에게 알린다.
         9. app/signal-quality.json은 생성 파일이다. 직접 편집하지 않는다.

[레코드] app/signals.json의 기존 같은 채널 레코드 구조를 그대로 따른다.
         새 필드를 만들지 말고 기존 필드명을 재사용한다.`);
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

const hasWork =
  failures.length + keywordGaps.length + underQueried.length + thinSamples.length > 0;

console.log(`\n${"=".repeat(72)}`);
console.log("완료 파이프라인 — 순서대로, 전부 통과한 뒤에만 커밋한다");
console.log("=".repeat(72));
console.log(`
  npm run validate:signals   # 데이터 계약 검증. ERROR 0건이 될 때까지 수정한다.
                             # 메시지가 제품·채널 단위로 무엇이 잘못됐는지 알려준다.
                             # WARNING은 참고용이며 커밋을 막지 않는다.
  npm run audit:signals      # 통계 보정 파일 재생성. 생략하면 대시보드가 옛 점수를 쓴다.
  npm run test:unit          # 회귀 테스트

  git add -A && git commit -m "데이터 재수집: <범위 요약>" && git push github main

  배포(npx vercel --prod)는 명시적으로 요청받았을 때만 한다.

[보고]   채널별 재검색 제품 수·검색어 수·채택 수 / 검증 ERROR 건수 / 테스트 통과 수
         / 커밋 해시 / 남은 격차(관련 결과 없음, 재시도 실패, 검색어 못 찾은 제품)

[참고]   상세 절차 docs/recollection-runbook.md · 채널 기준 docs/collection-protocol.md
         점수는 교차중복 분할·기간 필터·상위5 상한 보정을 거친다. 관련 없는 콘텐츠를
         많이 넣는 것보다 관련 있는 것을 정확히 넣는 편이 점수와 신뢰도를 올린다.`);
console.log("=".repeat(72));
if (!hasWork && !plan.needsFullRefresh) {
  console.log("\n지금은 재수집이 필요한 항목이 없다. 데이터가 최신 상태다.");
}
