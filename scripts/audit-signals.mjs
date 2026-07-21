// 수집 데이터 통계 감사 스크립트.
// signals.json을 읽어 제품·채널별 품질 지표와 보정 지표를 계산해
// app/signal-quality.json으로 저장한다. 대시보드는 이 파일의 보정 지표로
// 점수를 계산하고 신뢰도 배지를 표시한다.
//
// 보정 원칙
// 1. 교차 제품 공유 콘텐츠: 같은 콘텐츠가 k개 제품에 채택됐으면 조회·반응을
//    k로 나눠 배분한다. 브랜드를 특정하지 못하는 콘텐츠가 여러 제품에 동시에
//    집계되는 이중 계산을 제거한다.
// 2. 수집 기간: 프로토콜 기간(YouTube 365일, Instagram·TikTok 180일)을 벗어난
//    콘텐츠는 보정 지표에서 제외하고 비율만 기록한다.
// 3. 신뢰도: 표본 5개 미만 low, 5~9개 medium, 10개 이상 high.
// 4. 네이버 변화율: 기저 지수가 노이즈 수준(최근·직전 30일 평균 < 1)이면
//    변화율을 신뢰할 수 없음으로 표시한다.
// 5. 표본 기회 균등화: 검색어를 많이 시도한 제품일수록 채택 콘텐츠가 늘어
//    합계가 커지는 편향이 있다(검색어 1개 제품 평균 3.3개 vs 3개 제품 10.6개).
//    점수용 지표는 상위 5개 콘텐츠 합계로 상한을 둔다.
// 6. 형평성 플래그: 검색어 수 부족, SKU형 장문 검색어, 검색어 일부만 시도된
//    수집, 수집 실패(429 등)를 제품별로 기록해 UI에서 보강을 유도한다.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const signalsPath = path.join(root, "app", "signals.json");
const outputPath = path.join(root, "app", "signal-quality.json");

const signals = JSON.parse(fs.readFileSync(signalsPath, "utf8"));
const referenceDate = new Date(signals.collectedAt);

const YOUTUBE_WINDOW_DAYS = 365;
const SOCIAL_WINDOW_DAYS = 180;
const NAVER_NOISE_FLOOR = 1; // DataLab 상대지수 30일 평균이 이보다 작으면 변화율 해석 불가
const OUTLIER_DOMINANCE = 0.7;
const TOP_SAMPLE_CAP = 5; // 점수용 상위 콘텐츠 수 — 검색어 시도 횟수 편향 완화

const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const topCapSum = (values, cap = TOP_SAMPLE_CAP) =>
  [...values]
    .sort((a, b) => b - a)
    .slice(0, cap)
    .reduce((sum, value) => sum + value, 0);

const confidenceTier = (n) => (n >= 10 ? "high" : n >= 5 ? "medium" : "low");

// "8개월 전", "1년 전", "3주 전", "6일 전", "10시간 전" → 대략적 경과 일수.
// 파싱 불가하면 null(기간 내로 간주해 표본을 유지한다).
const relativeAgeDays = (text) => {
  const match = /(\d+)\s*(년|개월|주|일|시간|분)/.exec(text || "");
  if (!match) return null;
  const n = Number(match[1]);
  switch (match[2]) {
    case "년":
      return n * 365;
    case "개월":
      return n * 30;
    case "주":
      return n * 7;
    case "일":
      return n;
    default:
      return 0;
  }
};

const isoAgeDays = (iso) => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return (referenceDate - date) / 86_400_000;
};

// 1패스: 콘텐츠 ID → 채택한 제품 수 (플랫폼별)
const sharedCounts = { youtube: new Map(), instagram: new Map(), tiktok: new Map() };
const contentKey = (item) => item.id || item.url;
for (const product of signals.products) {
  for (const video of product.youtube?.topVideos || []) {
    const map = sharedCounts.youtube;
    map.set(video.id, (map.get(video.id) || 0) + 1);
  }
  for (const platform of ["instagram", "tiktok"]) {
    for (const item of product[platform]?.items || []) {
      const map = sharedCounts[platform];
      map.set(contentKey(item), (map.get(contentKey(item)) || 0) + 1);
    }
  }
}

const engagementOf = (item) =>
  (item.likes || 0) +
  (item.comments || 0) * 4 +
  (item.reposts || item.shares || 0) * 6 +
  (item.saves || 0) * 2;

const auditYoutube = (product) => {
  const source = product.youtube;
  if (source?.status !== "collected") return null;
  const videos = source.topVideos || [];
  const inWindow = videos.filter((video) => {
    const age = relativeAgeDays(video.published);
    return age == null || age <= YOUTUBE_WINDOW_DAYS;
  });
  const adjustedViews = inWindow.map(
    (video) => (video.views || 0) / (sharedCounts.youtube.get(video.id) || 1),
  );
  const sharedVideos = videos.filter(
    (video) => (sharedCounts.youtube.get(video.id) || 1) > 1,
  );
  const rawViews = videos.reduce((sum, video) => sum + (video.views || 0), 0);
  const sharedViews = sharedVideos.reduce((sum, video) => sum + (video.views || 0), 0);
  const staleViews = videos
    .filter((video) => {
      const age = relativeAgeDays(video.published);
      return age != null && age > YOUTUBE_WINDOW_DAYS;
    })
    .reduce((sum, video) => sum + (video.views || 0), 0);
  const adjustedTotal = adjustedViews.reduce((sum, views) => sum + views, 0);
  const maxAdjusted = adjustedViews.length ? Math.max(...adjustedViews) : 0;
  return {
    sampleCount: videos.length,
    adjustedSampleCount: inWindow.length,
    confidence: confidenceTier(inWindow.length),
    sharedContentCount: sharedVideos.length,
    sharedViewsShare: rawViews ? sharedViews / rawViews : 0,
    staleCount: videos.length - inWindow.length,
    staleViewsShare: rawViews ? staleViews / rawViews : 0,
    outlierDominated: adjustedTotal > 0 && maxAdjusted / adjustedTotal >= OUTLIER_DOMINANCE,
    adjustedTotalViews: Math.round(adjustedTotal),
    adjustedTopViews: Math.round(topCapSum(adjustedViews)),
    adjustedMedianViews: adjustedViews.length ? Math.round(median(adjustedViews)) : null,
  };
};

const auditSocial = (product, platform) => {
  const source = product[platform];
  if (source?.status !== "collected") return null;
  const items = source.items || [];
  const inWindow = items.filter((item) => {
    const age = isoAgeDays(item.publishedAt);
    return age == null || age <= SOCIAL_WINDOW_DAYS;
  });
  const shareOf = (item) => sharedCounts[platform].get(contentKey(item)) || 1;
  const adjustedViews = inWindow.map((item) => (item.views || 0) / shareOf(item));
  const adjustedEngagement = inWindow.map((item) => engagementOf(item) / shareOf(item));
  const rawViews = items.reduce((sum, item) => sum + (item.views || 0), 0);
  const rawEngagement = items.reduce((sum, item) => sum + engagementOf(item), 0);
  const sharedItems = items.filter((item) => shareOf(item) > 1);
  const adjustedTotal = adjustedViews.reduce((sum, views) => sum + views, 0);
  const maxAdjusted = adjustedViews.length ? Math.max(...adjustedViews) : 0;
  return {
    sampleCount: items.length,
    adjustedSampleCount: inWindow.length,
    confidence: confidenceTier(inWindow.length),
    sharedContentCount: sharedItems.length,
    staleCount: items.length - inWindow.length,
    staleViewsShare: rawViews
      ? items
          .filter((item) => {
            const age = isoAgeDays(item.publishedAt);
            return age != null && age > SOCIAL_WINDOW_DAYS;
          })
          .reduce((sum, item) => sum + (item.views || 0), 0) / rawViews
      : 0,
    viewsAvailable: rawViews > 0,
    engagementAvailable: rawEngagement > 0,
    outlierDominated: adjustedTotal > 0 && maxAdjusted / adjustedTotal >= OUTLIER_DOMINANCE,
    adjustedViews: Math.round(adjustedTotal),
    adjustedTopViews: Math.round(topCapSum(adjustedViews)),
    adjustedEngagement: Math.round(
      adjustedEngagement.reduce((sum, value) => sum + value, 0),
    ),
    adjustedTopEngagement: Math.round(topCapSum(adjustedEngagement)),
  };
};

const auditNaver = (product) => {
  const trend = product.naver?.trend;
  if (!trend) return null;
  const baselineSufficient = (trend.latest30Mean ?? 0) >= NAVER_NOISE_FLOOR;
  const changeReliable =
    baselineSufficient &&
    (trend.previous30Mean ?? 0) >= NAVER_NOISE_FLOOR &&
    trend.changePct != null;
  return {
    hasSignal: (trend.anchorNormalizedLatest30 ?? 0) > 0,
    baselineSufficient,
    changeReliable,
    confidence: baselineSufficient ? "high" : (trend.anchorNormalizedLatest30 ?? 0) > 0 ? "low" : "none",
  };
};

const auditGoogle = (product) => {
  const source = product.google;
  if (source?.status !== "collected") return null;
  const baselineSufficient = (source.recent4WeekAverage ?? 0) >= 1;
  return {
    baselineSufficient,
    changeReliable:
      baselineSufficient && (source.previous4WeekAverage ?? 0) >= 1 && source.changePct != null,
    confidence: baselineSufficient ? "high" : "low",
  };
};

// 전 제품의 90% 이상에 해당하는 수집 격차는 제품별 제안 대신 전역 이슈로
// 한 번만 보고한다(예: TikTok 수집이 전 제품에서 검색어 1개만 시도됨).
const systemicUnderQuery = new Set();
for (const [platform, label] of [
  ["youtube", "YouTube"],
  ["instagram", "Instagram"],
  ["tiktok", "TikTok"],
]) {
  const eligible = signals.products.filter(
    (product) => (product.keywords || []).length >= 2 && product[platform],
  );
  const under = eligible.filter(
    (product) => (product[platform].attemptedQueries || []).length < 2,
  );
  if (eligible.length && under.length / eligible.length >= 0.9) {
    systemicUnderQuery.add(platform);
  }
}

// 검색어·수집 형평성 진단. 점수와 별개로, 어떤 제품이 "덜 조사되어" 낮게
// 나오는지 구분할 수 있게 한다.
const auditFairness = (product) => {
  const keywords = product.keywords || [];
  const minTokens = keywords.length
    ? Math.min(...keywords.map((keyword) => keyword.split(/\s+/).length))
    : 0;
  const suggestions = [];
  const collectionGaps = [];

  if (keywords.length < 2) {
    suggestions.push(
      `대표 검색어가 ${keywords.length}개뿐입니다. 프로토콜 기준(2~4개)에 맞춰 소비자 통칭·별칭을 보강하면 표본이 늘어납니다.`,
    );
  }
  if (minTokens >= 4) {
    suggestions.push(
      "검색어가 SKU형 장문이라 검색 노출이 적을 수 있습니다. 짧은 소비자 통칭을 추가하세요.",
    );
  }
  for (const [platform, label] of [
    ["youtube", "YouTube"],
    ["instagram", "Instagram"],
    ["tiktok", "TikTok"],
  ]) {
    const source = product[platform];
    if (!source || systemicUnderQuery.has(platform)) continue;
    const attempted = (source.attemptedQueries || []).length;
    if (keywords.length >= 2 && attempted > 0 && attempted < Math.min(keywords.length, 2)) {
      suggestions.push(
        `${label}은 검색어 ${attempted}개만 시도됐습니다. 재수집 시 전체 검색어를 적용하면 결과가 늘 수 있습니다.`,
      );
    }
    if (["rate_limited", "error", "blocked"].includes(source.status)) {
      collectionGaps.push({ platform, status: source.status });
    }
  }
  if (product.google?.status === "rate_limited") {
    collectionGaps.push({ platform: "google", status: "rate_limited" });
    suggestions.push(
      "Google Trends 수집이 429로 실패했습니다. 재수집 전까지 이 채널은 점수 비중에서 제외됩니다.",
    );
  }
  return {
    keywordCount: keywords.length,
    minKeywordTokens: minTokens,
    collectionGaps,
    suggestions,
  };
};

const tierRank = { high: 2, medium: 1, low: 0 };

const overallVerdict = (channels) => {
  const informative = [];
  if (channels.naver?.hasSignal) {
    informative.push(channels.naver.baselineSufficient ? "high" : "low");
  }
  if (channels.google?.baselineSufficient) informative.push("high");
  for (const key of ["youtube", "instagram", "tiktok"]) {
    const channel = channels[key];
    if (!channel) continue;
    if (channel.adjustedSampleCount > 0) {
      // 공유 콘텐츠가 조회수 절반 이상이면 브랜드 특정성이 낮으므로 강등한다.
      const contaminated = (channel.sharedViewsShare ?? 0) >= 0.5;
      informative.push(contaminated ? "low" : channel.confidence);
    }
  }
  const solid = informative.filter((tier) => tierRank[tier] >= 1).length;
  if (solid >= 2) return "usable";
  if (informative.length >= 2 || solid >= 1) return "caution";
  return "insufficient";
};

const quality = {};
for (const product of signals.products) {
  const channels = {
    youtube: auditYoutube(product),
    instagram: auditSocial(product, "instagram"),
    tiktok: auditSocial(product, "tiktok"),
    naver: auditNaver(product),
    google: auditGoogle(product),
  };
  quality[product.name] = {
    ...channels,
    fairness: auditFairness(product),
    verdict: overallVerdict(channels),
  };
}

const platformLabels = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok" };
const summary = {
  auditedAt: signals.collectedAt,
  referenceDate: referenceDate.toISOString(),
  products: Object.keys(quality).length,
  verdicts: Object.values(quality).reduce((acc, entry) => {
    acc[entry.verdict] = (acc[entry.verdict] || 0) + 1;
    return acc;
  }, {}),
  sharedYoutubeVideos: [...sharedCounts.youtube.values()].filter((count) => count > 1).length,
  systemicIssues: [...systemicUnderQuery].map(
    (platform) =>
      `${platformLabels[platform]} 수집이 전 제품에서 검색어 1개만 시도됐습니다. 재수집 시 제품별 전체 검색어를 적용해야 제품 간 비교가 공정해집니다.`,
  ),
};

fs.writeFileSync(
  outputPath,
  JSON.stringify({ meta: summary, products: quality }, null, 1),
);
console.log("signal-quality.json written:", JSON.stringify(summary));
