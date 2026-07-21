// 수집 데이터 계약 검증기.
// 재수집 에이전트(사람·Codex 등)가 signals.json을 갱신한 뒤 반드시 실행한다.
// ERROR가 하나라도 있으면 종료 코드 1 — 그 상태로 커밋하지 않는다.
// WARNING은 품질 참고 정보이며 커밋을 막지 않는다.
//
// 사용법: npm run validate:signals

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const signals = JSON.parse(
  fs.readFileSync(path.join(root, "app", "signals.json"), "utf8"),
);

const errors = [];
const warnings = [];
const err = (product, message) => errors.push(`${product} — ${message}`);
const warn = (product, message) => warnings.push(`${product} — ${message}`);

const ALLOWED_STATUS = {
  youtube: ["collected", "no_results", "no_relevant_results"],
  instagram: ["collected", "no_results", "no_relevant_results"],
  tiktok: ["collected", "no_results", "no_relevant_results"],
  naver: ["collected"],
  google: ["collected", "no_data", "rate_limited"],
};
const SOCIAL_WINDOW_DAYS = { instagram: 180, tiktok: 180 };

const referenceDate = new Date(signals.collectedAt);
if (Number.isNaN(referenceDate.getTime())) {
  errors.push(`(root) — collectedAt이 유효한 ISO 시각이 아님: ${signals.collectedAt}`);
}

const isCount = (value) => Number.isInteger(value) && value >= 0;
// 지표는 "숫자" 또는 "null(비공개·미표시)"만 허용한다. 문자열·추정치 금지.
const isMetric = (value) => value === null || value === undefined || (typeof value === "number" && Number.isFinite(value) && value >= 0);
const isHttps = (value) => typeof value === "string" && value.startsWith("https://");

const checkSource = (product, platform, source) => {
  if (!source.collectedAt || Number.isNaN(new Date(source.collectedAt).getTime())) {
    err(product, `${platform}: collectedAt 누락 또는 형식 오류`);
  }
  if (!isHttps(source.sourceUrl)) {
    err(product, `${platform}: sourceUrl(https) 누락 — 모든 수집은 원본 검색 URL을 남겨야 함`);
  }
  if (!Array.isArray(source.attemptedQueries) || source.attemptedQueries.length === 0) {
    err(product, `${platform}: attemptedQueries 누락 — 시도한 검색어를 모두 기록해야 함`);
  }
};

for (const product of signals.products) {
  const name = product.name;
  if (!name) {
    errors.push("(unknown) — name 누락");
    continue;
  }
  if (!Array.isArray(product.keywords) || product.keywords.length === 0) {
    err(name, "keywords 누락");
  } else if (product.keywords.length < 2) {
    warn(name, `대표 검색어가 ${product.keywords.length}개 — 프로토콜 기준 2~4개`);
  }

  for (const [platform, allowed] of Object.entries(ALLOWED_STATUS)) {
    const source = product[platform];
    if (!source) {
      err(name, `${platform}: 레코드 자체가 없음`);
      continue;
    }
    if (!allowed.includes(source.status)) {
      err(name, `${platform}: 허용되지 않은 status "${source.status}" (허용: ${allowed.join(", ")})`);
      continue;
    }
    if (source.status !== "collected" && platform !== "naver") continue;
    // 네이버는 collectedAt·검색어가 trend 내부에 있는 구조라 별도 검증한다.
    if (platform !== "naver") checkSource(name, platform, source);

    if (platform === "youtube") {
      const videos = source.topVideos || [];
      if (!isCount(source.resultSampleCount)) err(name, "youtube: resultSampleCount 누락");
      if (!isMetric(source.totalViews) || !isMetric(source.medianViews)) {
        err(name, "youtube: totalViews/medianViews는 숫자 또는 null이어야 함");
      }
      const ids = videos.map((video) => video.id);
      if (new Set(ids).size !== ids.length) err(name, "youtube: topVideos에 중복 videoId");
      const sum = videos.reduce((acc, video) => acc + (video.views || 0), 0);
      if (sum > (source.totalViews ?? 0) + 1) {
        err(name, `youtube: sum(topVideos.views)=${sum} > totalViews=${source.totalViews} — 합계 불일치`);
      }
      for (const video of videos) {
        if (!video.id || !isHttps(video.url)) err(name, `youtube: 영상 항목에 id/url 누락 (${video.title ?? "?"})`);
        if (!isMetric(video.views)) err(name, `youtube: views가 숫자/null이 아님 (${video.id})`);
      }
      if (videos.length < 5) warn(name, `youtube: 표본 ${videos.length}개 — 5개 미만은 low confidence`);
    }

    if (platform === "instagram" || platform === "tiktok") {
      const items = source.items || [];
      if (source.acceptedCount !== items.length) {
        err(name, `${platform}: acceptedCount(${source.acceptedCount}) ≠ items 수(${items.length})`);
      }
      const keys = items.map((item) => item.id || item.url);
      if (new Set(keys).size !== keys.length) err(name, `${platform}: items에 중복 콘텐츠`);
      const sums = { views: 0, likes: 0, comments: 0 };
      for (const item of items) {
        if (!isHttps(item.url)) err(name, `${platform}: item url(https) 누락`);
        const published = new Date(item.publishedAt ?? "");
        if (Number.isNaN(published.getTime())) {
          err(name, `${platform}: publishedAt 누락/형식 오류 (${item.id || item.url}) — ISO 날짜 필수`);
        } else {
          if (published > referenceDate && published - referenceDate > 86_400_000) {
            err(name, `${platform}: 미래 날짜 publishedAt (${item.publishedAt})`);
          }
          const ageDays = (referenceDate - published) / 86_400_000;
          if (ageDays > SOCIAL_WINDOW_DAYS[platform]) {
            warn(name, `${platform}: 기간(${SOCIAL_WINDOW_DAYS[platform]}일) 밖 콘텐츠 — 점수에서 자동 제외됨 (${item.publishedAt})`);
          }
        }
        for (const field of ["views", "likes", "comments", "shares", "reposts", "saves"]) {
          if (item[field] !== undefined && !isMetric(item[field])) {
            err(name, `${platform}: ${field}가 숫자/null이 아님 (${item.id || item.url}) — 추정치·문자열 금지`);
          }
        }
        sums.views += item.views || 0;
        sums.likes += item.likes || 0;
        sums.comments += item.comments || 0;
      }
      const totals = source.totals || {};
      for (const field of ["views", "likes", "comments"]) {
        if (Math.abs((totals[field] || 0) - sums[field]) > 1) {
          err(name, `${platform}: totals.${field}(${totals[field]}) ≠ items 합계(${sums[field]})`);
        }
      }
      if (items.length > 0 && items.length < 5) {
        warn(name, `${platform}: 표본 ${items.length}개 — 5개 미만은 low confidence`);
      }
      const attempted = (source.attemptedQueries || []).length;
      const expected = Math.min(2, (product.keywords || []).length);
      if (attempted > 0 && attempted < expected) {
        warn(name, `${platform}: 검색어 ${attempted}개만 시도 — 전체 검색어 적용 권장`);
      }
    }

    if (platform === "naver") {
      if (!isHttps(source.sourceUrl)) err(name, "naver: sourceUrl(https) 누락");
      const trend = source.trend;
      if (!trend) {
        err(name, "naver: trend 누락");
      } else {
        for (const field of ["latest30Mean", "anchorLatest30Mean", "anchorNormalizedLatest30"]) {
          if (typeof trend[field] !== "number") err(name, `naver: trend.${field} 누락/형식 오류`);
        }
        if (!trend.anchor) err(name, "naver: 공통 기준어(anchor) 누락");
        if (!trend.collectedAt || Number.isNaN(new Date(trend.collectedAt).getTime())) {
          err(name, "naver: trend.collectedAt 누락/형식 오류");
        }
        if (!Array.isArray(trend.keywords) || trend.keywords.length === 0) {
          err(name, "naver: trend.keywords(조사 키워드군) 누락");
        }
      }
    }

    if (platform === "google") {
      if (!isMetric(source.recent4WeekAverage)) err(name, "google: recent4WeekAverage 누락/형식 오류");
      if (!isCount(source.pointCount)) err(name, "google: pointCount 누락");
    }
  }
}

console.log(`검증 대상: ${signals.products.length}개 제품 (수집 기준 ${signals.collectedAt})`);
if (warnings.length) {
  console.log(`\nWARNING ${warnings.length}건 (커밋 가능, 품질 참고):`);
  const shown = warnings.slice(0, 30);
  for (const message of shown) console.log(`  ⚠ ${message}`);
  if (warnings.length > shown.length) console.log(`  … 외 ${warnings.length - shown.length}건`);
}
if (errors.length) {
  console.log(`\nERROR ${errors.length}건 — 수정 전까지 커밋 금지:`);
  for (const message of errors) console.log(`  ✖ ${message}`);
  process.exit(1);
}
console.log("\nERROR 0건 — 데이터 계약 통과. 다음: npm run audit:signals && npm run test:unit");
