"use client";

import { type CSSProperties, useEffect, useMemo, useState } from "react";
import catalog from "./product-catalog.json";
import signalFile from "./signals.json";
import qualityFile from "./signal-quality.json";
import type { ReportRow } from "./report-export";
import PharmacyView, { useRevealOnScroll } from "./pharmacy-view";

type Signal = any;
type Quality = Signal;
type Platform = "youtube" | "instagram" | "tiktok" | "naver" | "google";
type ChannelWeights = Record<Platform, number>;
type ChannelScores = Record<Platform, number | null>;
type ManualItem = {
  id: string;
  label: string;
  url: string;
  views: string;
  likes: string;
  comments: string;
  shares: string;
  classification: "independent" | "sponsored" | "official";
  note: string;
};
type ManualRecord = {
  contentCount: string;
  views: string;
  likes: string;
  comments: string;
  shares: string;
  evidenceUrl: string;
  note: string;
  collectedAt: string;
  items?: ManualItem[];
};

const newManualItem = (): ManualItem => ({
  id: crypto.randomUUID(),
  label: "",
  url: "",
  views: "",
  likes: "",
  comments: "",
  shares: "",
  classification: "independent",
  note: "",
});

const numericValue = (value: string) => {
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const platforms: { id: Platform; name: string; rule: string }[] = [
  {
    id: "naver",
    name: "네이버",
    rule: "DataLab 검색어 트렌드 · 최근 1년 · 별칭을 한 키워드군으로 묶어 최근 30일 평균과 증감 비교",
  },
  {
    id: "google",
    name: "Google",
    rule: "Google Trends · 대한민국 · 최근 1년 · 검색 관심도와 증감 비교 · 429 발생 시 재수집 대기",
  },
  {
    id: "youtube",
    name: "YouTube",
    rule: "최근 365일 · 상위 20개 검토 · 관련 영상 최대 10개 · 조회수 중앙값과 합계 · Shorts 분리",
  },
  {
    id: "instagram",
    name: "Instagram",
    rule: "최근 180일 · 상위 20개 검토 · 관련 게시물 최대 10개 · 협찬 분리",
  },
  {
    id: "tiktok",
    name: "TikTok",
    rule: "최근 180일 · 상위 20개 검토 · 관련 영상 최대 10개 · 공유 포함",
  },
];
const knownSkuNames = new Set(
  signalFile.products.flatMap((product) => [
    ...product.skuNames,
    ...(product.sourceAliases ?? []),
  ]),
);
const catalogSignals: Signal[] = catalog.products
  .filter((name) => !knownSkuNames.has(name))
  .map((name) => {
    const keyword = name
      .replace(/\([^)]*\)/g, " ")
      .replace(/\b\d+(?:\.\d+)?\s*(?:ml|g|mg|매|포|정|캡슐|튜브)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    const manualSource = (platform: string) => ({
      status: "manual_required",
      reason: `${platform}에서 사람이 검색 결과를 확인해야 합니다.`,
      sourceUrl: "",
    });
    return {
      id: `catalog-${name}`,
      name: keyword || name,
      keyword: keyword || name,
      keywords: [keyword || name],
      skuNames: [name],
      exclude: [],
      reason:
        "제품명에서 용량 표기를 덜어낸 검색어입니다. 필요하면 직접 다듬어 주세요.",
      youtube: manualSource("YouTube"),
      instagram: manualSource("Instagram"),
      tiktok: manualSource("TikTok"),
      naver: manualSource("네이버"),
      google: manualSource("Google"),
    };
  });
const allProducts: Signal[] = [...signalFile.products, ...catalogSignals];
const fmt = (v?: number | null) =>
  v == null ? "—" : v.toLocaleString("ko-KR");

const qualityOf = (name: string): Quality | undefined =>
  (qualityFile.products as Record<string, Quality>)[name];
const verdictLabel: Record<string, { text: string; tone: string }> = {
  usable: { text: "판단 가능", tone: "ok" },
  caution: { text: "주의", tone: "warn" },
  insufficient: { text: "표본 부족", tone: "bad" },
};
const confidenceLabel: Record<string, string> = {
  high: "높음",
  medium: "중간",
  low: "낮음",
  none: "없음",
};

// collectedAt이 UTC(Z)든 +09:00이든 KST 기준으로 일관 표시한다.
const collectedAtKst = new Date(signalFile.collectedAt)
  .toLocaleString("sv-SE", { timeZone: "Asia/Seoul" })
  .slice(0, 16);

const recommendedWeights: ChannelWeights = {
  naver: 35,
  google: 10,
  youtube: 25,
  instagram: 15,
  tiktok: 15,
};

const weightPresets: {
  id: string;
  name: string;
  description: string;
  weights: ChannelWeights;
}[] = [
  {
    id: "recommended",
    name: "현재 데이터 권장",
    description: "수집 커버리지와 채널 신뢰도를 함께 반영",
    weights: recommendedWeights,
  },
  {
    id: "search",
    name: "검색 수요 중심",
    description: "구매 의도가 비교적 선명한 검색 관심도 중심",
    weights: { naver: 55, google: 20, youtube: 10, instagram: 10, tiktok: 5 },
  },
  {
    id: "viral",
    name: "바이럴 반응 중심",
    description: "Instagram과 TikTok의 확산·반응 중심",
    weights: { naver: 10, google: 5, youtube: 15, instagram: 40, tiktok: 30 },
  },
  {
    id: "video",
    name: "영상 확산 중심",
    description: "누적 조회와 영상 표본이 많은 제품 중심",
    weights: { naver: 10, google: 5, youtube: 45, instagram: 15, tiktok: 25 },
  },
];

function manualMetrics(record?: ManualRecord) {
  if (!record) return null;
  const items = record.items?.length ? record.items : [];
  const views = items.length
    ? items.reduce((sum, item) => sum + numericValue(item.views), 0)
    : numericValue(record.views);
  const likes = items.length
    ? items.reduce((sum, item) => sum + numericValue(item.likes), 0)
    : numericValue(record.likes);
  const comments = items.length
    ? items.reduce((sum, item) => sum + numericValue(item.comments), 0)
    : numericValue(record.comments);
  const shares = items.length
    ? items.reduce((sum, item) => sum + numericValue(item.shares), 0)
    : numericValue(record.shares);
  return { primary: views, secondary: likes + comments * 4 + shares * 6 };
}

function rawChannelMetrics(
  signal: Signal,
  platform: Platform,
  manual: Record<string, ManualRecord>,
) {
  const manualValue = manualMetrics(manual[`${signal.name}::${platform}`]);
  if (manualValue) return manualValue;
  const value = getAuto(signal, platform);
  if (["no_results", "no_relevant_results"].includes(value?.status)) {
    return { primary: 0, secondary: 0 };
  }
  // Google no_data는 "검색량이 식별 기준에 못 미침"이라는 정보이므로 소셜의
  // no_results와 같게 0으로 본다. rate_limited 같은 수집 실패만 null로 남긴다.
  if (platform === "google" && value?.status === "no_data") {
    return { primary: 0, secondary: 0 };
  }
  if (value?.status !== "collected" && !(platform === "naver" && value?.trend)) {
    return null;
  }
  if (platform === "naver") {
    return {
      primary: Number(value?.trend?.anchorNormalizedLatest30 ?? 0),
      secondary: Number(value?.trend?.latest90Mean ?? 0),
    };
  }
  if (platform === "google") {
    return {
      primary: Number(value?.recent4WeekAverage ?? 0),
      secondary: Number(value?.latest ?? 0),
    };
  }
  if (platform === "youtube") {
    const quality = qualityOf(signal.name)?.youtube;
    if (quality) {
      // 상위 5개 합계: 검색어를 많이 시도한 제품일수록 표본이 늘어나는
      // 수집 편향을 상한으로 완화한다.
      return {
        primary: Number(quality.adjustedTopViews ?? quality.adjustedTotalViews ?? 0),
        secondary: Number(quality.adjustedMedianViews ?? 0),
      };
    }
    return {
      primary: Number(value?.totalViews ?? 0),
      secondary: Number(value?.medianViews ?? 0),
    };
  }
  const quality = qualityOf(signal.name)?.[platform];
  if (quality) {
    return {
      primary: Number(quality.adjustedTopViews ?? quality.adjustedViews ?? 0),
      secondary: Number(quality.adjustedTopEngagement ?? quality.adjustedEngagement ?? 0),
    };
  }
  const totals = value?.totals || {};
  return {
    primary: Number(totals.views ?? 0),
    secondary:
      Number(totals.likes ?? 0) +
      Number(totals.comments ?? 0) * 4 +
      Number(totals.reposts ?? 0) * 6 +
      Number(totals.saves ?? 0) * 2,
  };
}

function percentile(value: number, values: number[]) {
  if (value <= 0) return 0;
  const positives = values.filter((item) => item > 0).sort((a, b) => a - b);
  if (!positives.length) return 0;
  return (positives.filter((item) => item <= value).length / positives.length) * 100;
}

function buildChannelScores(
  products: Signal[],
  manual: Record<string, ManualRecord>,
) {
  const metrics = new Map<string, ReturnType<typeof rawChannelMetrics>>();
  const result = new Map<string, ChannelScores>();
  for (const signal of products) {
    for (const platform of platforms) {
      metrics.set(
        `${signal.name}::${platform.id}`,
        rawChannelMetrics(signal, platform.id, manual),
      );
    }
  }
  for (const platform of platforms) {
    const available = products
      .map((signal) => metrics.get(`${signal.name}::${platform.id}`))
      .filter(Boolean) as { primary: number; secondary: number }[];
    const primaryValues = available.map((item) => item.primary);
    const secondaryValues = available.map((item) => item.secondary);
    const usePrimary = primaryValues.some((value) => value > 0);
    const useSecondary = secondaryValues.some((value) => value > 0);
    for (const signal of products) {
      const metric = metrics.get(`${signal.name}::${platform.id}`);
      const current = result.get(signal.name) || ({} as ChannelScores);
      if (!metric) {
        current[platform.id] = null;
      } else {
        const parts = [
          usePrimary ? { score: percentile(metric.primary, primaryValues), weight: 70 } : null,
          useSecondary
            ? { score: percentile(metric.secondary, secondaryValues), weight: 30 }
            : null,
        ].filter(Boolean) as { score: number; weight: number }[];
        const denominator = parts.reduce((sum, part) => sum + part.weight, 0);
        current[platform.id] = denominator
          ? parts.reduce((sum, part) => sum + part.score * part.weight, 0) /
            denominator
          : 0;
      }
      result.set(signal.name, current);
    }
  }
  return result;
}

function weightedScore(scores: ChannelScores, weights: ChannelWeights) {
  // 수집 실패(null) 채널은 분모에서 제외한다. 실패를 0점처럼 취급하면
  // "데이터를 못 모은 제품"이 "관심이 없는 제품"과 같은 벌점을 받는다.
  // 측정된 채널 범위는 근거 커버리지로 별도 표시한다.
  const denominator = platforms.reduce(
    (sum, platform) =>
      sum + (scores[platform.id] == null ? 0 : weights[platform.id]),
    0,
  );
  if (!denominator) return 0;
  return platforms.reduce(
    (sum, platform) =>
      sum + (scores[platform.id] ?? 0) * weights[platform.id],
    0,
  ) / denominator;
}

function scoreCoverage(scores: ChannelScores, weights: ChannelWeights) {
  const total = platforms.reduce((sum, platform) => sum + weights[platform.id], 0);
  if (!total) return 0;
  return (
    platforms.reduce(
      (sum, platform) =>
        sum + (scores[platform.id] == null ? 0 : weights[platform.id]),
      0,
    ) / total
  ) * 100;
}

function getAuto(signal: Signal, platform: Platform) {
  return signal[platform as keyof Signal] as Record<string, any> | undefined;
}

function statusOf(
  signal: Signal,
  platform: Platform,
  manual: Record<string, ManualRecord>,
) {
  if (manual[`${signal.name}::${platform}`]) return "manual";
  const auto = getAuto(signal, platform);
  return ["collected", "no_results", "no_relevant_results", "no_data"].includes(auto?.status)
    ? "auto"
    : auto?.status === "manual_required"
      ? "needed"
      : "blocked";
}

function platformSummary(signal: Signal, platform: Platform) {
  const value = getAuto(signal, platform);
  const quality = qualityOf(signal.name);
  if (platform === "naver" && value?.trend) {
    const trend = value.trend;
    const change = quality?.naver?.changeReliable
      ? `30일 증감 ${trend.changePct > 0 ? "+" : ""}${trend.changePct}%`
      : "검색량 기저 미달 · 증감 해석 불가";
    return `기준어 대비 ${fmt(trend.anchorNormalizedLatest30)} · ${change}`;
  }
  if (platform === "youtube" && value?.status === "collected") {
    const yq = quality?.youtube;
    if (yq) {
      return `${fmt(yq.adjustedSampleCount)}개 영상 · 보정 조회 ${fmt(yq.adjustedTotalViews)} · 신뢰도 ${confidenceLabel[yq.confidence]}`;
    }
    return `${fmt(value.resultSampleCount)}개 영상 · 조회 ${fmt(value.totalViews)}`;
  }
  if (["instagram", "tiktok"].includes(platform) && value?.status === "collected") {
    const sq = quality?.[platform];
    if (sq) {
      return `${fmt(sq.adjustedSampleCount)}건 반영 · 보정 조회 ${fmt(sq.adjustedViews)} · 신뢰도 ${confidenceLabel[sq.confidence]}`;
    }
    return `${fmt(value.acceptedCount)}건 채택 · 조회 ${fmt(value.totals?.views)} · 좋아요 ${fmt(value.totals?.likes)}`;
  }
  if (["no_results", "no_relevant_results"].includes(value?.status)) {
    return value?.status === "no_results" ? "검색 결과 없음" : "제품 관련 콘텐츠 없음";
  }
  if (platform === "google" && value?.status === "collected") {
    const change = quality?.google?.changeReliable
      ? `${value.changePct > 0 ? "+" : ""}${value.changePct}%`
      : "기저 미달 · 해석 불가";
    return `최근 4주 평균 ${fmt(value.recent4WeekAverage)} · 증감 ${change}`;
  }
  if (platform === "google" && value?.status === "no_data") {
    return "Google Trends 검색량 부족";
  }
  return platforms.find((item) => item.id === platform)?.rule || "";
}

function CollectionDrawer({
  signal,
  platform,
  existing,
  onClose,
  onSave,
  onDelete,
}: {
  signal: Signal;
  platform: Platform;
  existing?: ManualRecord;
  onClose: () => void;
  onSave: (record: ManualRecord) => void;
  onDelete: () => void;
}) {
  const meta = platforms.find((p) => p.id === platform)!;
  const auto = getAuto(signal, platform);
  const [form, setForm] = useState<ManualRecord>(() => {
    const base = existing || {
      contentCount: "",
      views: "",
      likes: "",
      comments: "",
      shares: "",
      evidenceUrl: auto?.sourceUrl || "",
      note: "",
      collectedAt: new Date().toISOString(),
    };
    const legacyItem =
      existing && !existing.items?.length
        ? {
            ...newManualItem(),
            label: "기존 입력값",
            url: existing.evidenceUrl,
            views: existing.views,
            likes: existing.likes,
            comments: existing.comments,
            shares: existing.shares,
            note: existing.note,
          }
        : null;
    return {
      ...base,
      items: existing?.items?.length
        ? existing.items
        : legacyItem
          ? [legacyItem]
          : [newManualItem()],
    };
  });
  const items = form.items || [];
  const totals = useMemo(
    () => ({
      count: items.filter((item) =>
        [item.label, item.url, item.views, item.likes, item.comments, item.shares].some(
          Boolean,
        ),
      ).length,
      views: items.reduce((sum, item) => sum + numericValue(item.views), 0),
      likes: items.reduce((sum, item) => sum + numericValue(item.likes), 0),
      comments: items.reduce((sum, item) => sum + numericValue(item.comments), 0),
      shares: items.reduce((sum, item) => sum + numericValue(item.shares), 0),
    }),
    [items],
  );
  const updateItem = (id: string, key: keyof ManualItem, value: string) =>
    setForm({
      ...form,
      items: items.map((item) =>
        item.id === id ? { ...item, [key]: value } : item,
      ),
    });
  const addItem = () => setForm({ ...form, items: [...items, newManualItem()] });
  const removeItem = (id: string) =>
    setForm({
      ...form,
      items:
        items.length === 1
          ? [newManualItem()]
          : items.filter((item) => item.id !== id),
    });
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer collect-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${signal.name} 수집 작업`}
      >
        <button className="close" onClick={onClose} aria-label="닫기">
          ×
        </button>
        <span className="drawer-rank">{meta.name} 수집 작업</span>
        <h2>{signal.name}</h2>
        <p>
          검색 키워드: <b>{signal.keywords.join(" · ")}</b>
        </p>
        <div className="collection-rule">
          <b>수집 기준</b>
          <p>{meta.rule}</p>
        </div>
        {auto?.status === "collected" && (
          <div className="auto-result">
            <span>자동 수집 결과</span>
            {platform === "youtube" && (
              <>
                <strong>{fmt(auto.resultSampleCount)}개 영상 표본</strong>
                <p>
                  조회수 합계 {fmt(auto.totalViews)} · 중앙값{" "}
                  {fmt(auto.medianViews)}
                </p>
                {qualityOf(signal.name)?.youtube && (
                  <p>
                    보정 후 합계 {fmt(qualityOf(signal.name).youtube.adjustedTotalViews)} ·
                    중앙값 {fmt(qualityOf(signal.name).youtube.adjustedMedianViews)} · 공유 콘텐츠{" "}
                    {fmt(qualityOf(signal.name).youtube.sharedContentCount)}개 분할 반영
                  </p>
                )}
              </>
            )}
            {platform === "instagram" && (
              <>
                <strong>
                  {fmt(auto.inspectedCount)}건 확인 · {fmt(auto.acceptedCount)}건 채택
                </strong>
                <p>
                  독립 콘텐츠 {fmt(auto.classificationCounts?.independent)}건 · 협찬{" "}
                  {fmt(auto.classificationCounts?.sponsored)}건 · 공식{" "}
                  {fmt(auto.classificationCounts?.official)}건
                </p>
                <p>
                  독립 콘텐츠 좋아요 {fmt(auto.independentTotals?.likes)} · 댓글{" "}
                  {fmt(auto.independentTotals?.comments)} · 리포스트{" "}
                  {fmt(auto.independentTotals?.reposts)}
                </p>
              </>
            )}
            {platform === "naver" && (
              <>
                {auto.trend ? (
                  <>
                    <strong>
                      기준어 대비 {fmt(auto.trend.anchorNormalizedLatest30)}
                    </strong>
                    <p>
                      최근 30일 평균 {fmt(auto.trend.latest30Mean)} ·{" "}
                      {qualityOf(signal.name)?.naver?.changeReliable
                        ? `직전 30일 대비 ${auto.trend.changePct > 0 ? "+" : ""}${auto.trend.changePct}%`
                        : "검색량이 기저 수준(30일 평균 1) 미달이라 증감률을 해석하지 않습니다"}
                    </p>
                    <p>
                      공통 기준어: {auto.trend.anchor} · DataLab 공개 상대지수
                    </p>
                  </>
                ) : (
                  <>
                    <strong>
                      블로그 {fmt(auto.blogResultSampleCount)}개 · 카페{" "}
                      {fmt(auto.cafeResultSampleCount)}개
                    </strong>
                    <p>DataLab 시계열 수집 전 참고용 공개 검색 링크입니다.</p>
                  </>
                )}
              </>
            )}
            {platform === "google" && (
              <>
                <strong>
                  유기적 결과 {fmt(auto.organicResultSampleCount)}개
                </strong>
                <p>Google 공개 검색 첫 화면 표본입니다.</p>
              </>
            )}
            <a href={auto.sourceUrl} target="_blank">
              원본 검색 열기 ↗
            </a>
            {platform === "instagram" && auto.items?.length > 0 && (
              <div className="evidence-list">
                {auto.items.map((item: any) => (
                  <a key={item.id} href={item.url} target="_blank">
                    <span>@{item.account}</span>
                    <small>
                      {item.classification === "sponsored"
                        ? "협찬"
                        : item.classification === "official"
                          ? "공식"
                          : "독립"}
                      {" · 좋아요 "}
                      {item.likes == null ? "비공개" : fmt(item.likes)}
                      {" · 댓글 "}
                      {fmt(item.comments)}
                    </small>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
        {auto?.status !== "collected" && (
          <div className="manual-reason">
            <b>사람 확인 필요</b>
            <p>
              {auto?.reason || "공식 API 인증 또는 브라우저 수집이 필요합니다."}
            </p>
            <a href={auto?.sourceUrl} target="_blank">
              검색 화면 열기 ↗
            </a>
          </div>
        )}
        <div className="manual-form">
          <div className="manual-form-head">
            <div>
              <h3>게시물별 기록</h3>
              <p>게시물마다 보이는 숫자만 입력하면 합계는 자동 계산됩니다.</p>
            </div>
            <button type="button" onClick={addItem}>+ 게시물 추가</button>
          </div>
          <div className="manual-total-grid">
            <div><span>콘텐츠</span><strong>{fmt(totals.count)}개</strong></div>
            <div><span>조회수</span><strong>{fmt(totals.views)}</strong></div>
            <div><span>좋아요</span><strong>{fmt(totals.likes)}</strong></div>
            <div><span>댓글</span><strong>{fmt(totals.comments)}</strong></div>
            <div><span>공유</span><strong>{fmt(totals.shares)}</strong></div>
          </div>
          <div className="manual-items">
            {items.map((item, index) => (
              <section className="manual-item" key={item.id}>
                <div className="manual-item-head">
                  <strong>게시물 {index + 1}</strong>
                  <select
                    aria-label={`게시물 ${index + 1} 유형`}
                    value={item.classification}
                    onChange={(e) => updateItem(item.id, "classification", e.target.value)}
                  >
                    <option value="independent">독립 콘텐츠</option>
                    <option value="sponsored">협찬·광고</option>
                    <option value="official">공식 계정</option>
                  </select>
                  <button type="button" onClick={() => removeItem(item.id)}>삭제</button>
                </div>
                <div className="manual-item-main">
                  <label>
                    <span>계정·제목</span>
                    <input value={item.label} placeholder="@계정 또는 게시물 제목" onChange={(e) => updateItem(item.id, "label", e.target.value)} />
                  </label>
                  <label>
                    <span>원문 URL</span>
                    <input value={item.url} placeholder="https://..." onChange={(e) => updateItem(item.id, "url", e.target.value)} />
                  </label>
                </div>
                <div className="manual-item-metrics">
                  {(["views", "likes", "comments", "shares"] as const).map((key) => (
                    <label key={key}>
                      <span>{{ views: "조회수", likes: "좋아요", comments: "댓글", shares: "공유" }[key]}</span>
                      <input inputMode="numeric" value={item[key]} placeholder="0" onChange={(e) => updateItem(item.id, key, e.target.value)} />
                    </label>
                  ))}
                </div>
                <label className="manual-item-note">
                  <span>메모</span>
                  <input value={item.note} placeholder="관련성·광고 여부 등" onChange={(e) => updateItem(item.id, "note", e.target.value)} />
                </label>
              </section>
            ))}
          </div>
          <button
            className="primary"
            onClick={() =>
              onSave({
                ...form,
                contentCount: String(totals.count),
                views: String(totals.views),
                likes: String(totals.likes),
                comments: String(totals.comments),
                shares: String(totals.shares),
                evidenceUrl: items.find((item) => item.url)?.url || auto?.sourceUrl || "",
                note: `${items.filter((item) => item.classification === "sponsored").length}개 협찬·광고 분리`,
                collectedAt: new Date().toISOString(),
              })
            }
          >
            수집값 저장
          </button>
        </div>
      </aside>
    </div>
  );
}

function ProductDrawer({
  signal,
  manual,
  onClose,
  onOpen,
}: {
  signal: Signal;
  manual: Record<string, ManualRecord>;
  onClose: () => void;
  onOpen: (platform: Platform) => void;
}) {
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer product-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${signal.name} 수요 상세`}
      >
        <button className="close" onClick={onClose} aria-label="닫기">
          ×
        </button>
        <div className="drawer-intro">
          <span className="drawer-rank">제품 수요 상세</span>
          <h2>{signal.name}</h2>
          <p>
            검색 키워드: <b>{signal.keywords.join(" · ")}</b>
          </p>
          <div className="entity-rule">
            <b>통합 SKU</b>
            <p>{signal.skuNames.join(" · ")}</p>
            <b>키워드 선정 근거</b>
            <p>{signal.reason}</p>
            <b>제외어</b>
            <p>{signal.exclude.join(" · ")}</p>
          </div>
        </div>
        <div className="drawer-scroll">
          <h3 className="drawer-heading">채널별 수집 현황</h3>
          <div className="evidence-list">
            {platforms.map((p) => {
              const st = statusOf(signal, p.id, manual);
              return (
                <button key={p.id} onClick={() => onOpen(p.id)}>
                  <span className={`status-dot ${st}`} />
                  <b>{p.name}</b>
                  <small>{platformSummary(signal, p.id)}</small>
                  <strong>
                    {st === "auto"
                      ? "자동 확보"
                      : st === "manual"
                        ? "확인 완료"
                        : "확인 필요"}
                  </strong>
                  <i>›</i>
                </button>
              );
            })}
          </div>
          <div className="score-lock">
            <b>검색 관심도 수집 반영</b>
            <p>
              네이버는 공통 기준어 대비 상대 검색 관심도입니다. Google은 실제
              Trends 수집이 성공한 뒤에만 값이 표시됩니다.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}

function WeightControls({
  weights,
  onChange,
  scores,
}: {
  weights: ChannelWeights;
  onChange: (weights: ChannelWeights) => void;
  scores: Map<string, ChannelScores>;
}) {
  const total = platforms.reduce((sum, platform) => sum + weights[platform.id], 0);
  const activePreset = weightPresets.find((preset) =>
    platforms.every(
      (platform) => preset.weights[platform.id] === weights[platform.id],
    ),
  );
  return (
    <section className="weight-panel" aria-label="채널 가중치 설정">
      <div className="weight-panel-head">
        <div>
          <h3>채널별 비중</h3>
          <p>
            슬라이더를 움직이면 채널 안에서 정규화한 점수를 즉시 다시 합산해
            순위를 바꿉니다.
          </p>
        </div>
        <div className="weight-total">
          <span>현재 합계</span>
          <strong>{total}</strong>
          <small>합계와 관계없이 100%로 환산</small>
        </div>
      </div>
      <div className="preset-list">
        {weightPresets.map((preset) => (
          <button
            key={preset.id}
            className={activePreset?.id === preset.id ? "active" : ""}
            onClick={() => onChange({ ...preset.weights })}
            title={preset.description}
          >
            {preset.name}
          </button>
        ))}
      </div>
      <div className="weight-grid">
        {platforms.map((platform) => {
          const coverage = allProducts.filter(
            (signal) => scores.get(signal.name)?.[platform.id] != null,
          ).length;
          const effective = total ? Math.round((weights[platform.id] / total) * 100) : 0;
          return (
            <label className="weight-control" key={platform.id}>
              <span className="weight-label">
                <b>{platform.name}</b>
                <small>{coverage}/{allProducts.length}개 제품</small>
                <strong>{effective}%</strong>
              </span>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={weights[platform.id]}
                aria-label={`${platform.name} 가중치`}
                onChange={(event) =>
                  onChange({
                    ...weights,
                    [platform.id]: Number(event.target.value),
                  })
                }
                style={{ "--range-value": `${weights[platform.id]}%` } as CSSProperties}
              />
              <output>{weights[platform.id]}</output>
            </label>
          );
        })}
      </div>
      <p className="weight-guidance">
        <b>{activePreset?.name || "사용자 설정"}</b>
        {activePreset?.description || "조사 목적에 맞게 채널 비중을 직접 조정한 설정입니다."}
        <span>수집에 실패한 채널은 점수 분모에서 제외해 무벌점 처리하고, 측정 범위는 근거 커버리지로 표시합니다.</span>
      </p>
    </section>
  );
}

function ExportDrawer({
  presetName,
  weights,
  rows,
  manualCount,
  onClose,
}: {
  presetName: string;
  weights: ChannelWeights;
  rows: ReportRow[];
  manualCount: number;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [phase, setPhase] = useState<"idle" | "busy" | "done" | "error">(
    "idle",
  );
  const generatePassword = () => {
    const charset = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    const random = new Uint32Array(12);
    crypto.getRandomValues(random);
    setPassword(
      [...random].map((value) => charset[value % charset.length]).join(""),
    );
  };
  const run = async () => {
    setPhase("busy");
    try {
      const { exportDemandReport } = await import("./report-export");
      await exportDemandReport({
        password,
        presetName,
        weights,
        rows,
        manualCount,
      });
      setPhase("done");
    } catch {
      setPhase("error");
    }
  };
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer export-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="수요 데이터 내보내기"
      >
        <button className="close" onClick={onClose} aria-label="닫기">
          ×
        </button>
        <span className="drawer-rank">Excel 스냅샷</span>
        <h2>수요 데이터 내보내기</h2>
        <p>
          현재 화면 세팅 그대로 순위·채널 점수·보정 원자료를 단일 시트
          데이터 테이블로 저장합니다. 암호를 입력하면 <b>열람 암호가 걸린
          문서</b>(표준 ECMA-376 암호화)로 내보냅니다.
        </p>
        <div className="export-summary">
          <div>
            <span>적용 세팅</span>
            <strong>{presetName}</strong>
          </div>
          <div>
            <span>채널 비중</span>
            <strong>
              {platforms
                .map((platform) => `${platform.name} ${weights[platform.id]}`)
                .join(" · ")}
            </strong>
          </div>
          <div>
            <span>수록 범위</span>
            <strong>
              순위 {rows.length}개 제품 · 직접 입력 {manualCount}건 반영
            </strong>
          </div>
          <div>
            <span>문서 구성</span>
            <strong>단일 시트 · 순위 + 채널 점수 + 보정 원자료 15열</strong>
          </div>
          <div>
            <span>파일명</span>
            <strong>[웰니스박스] 약국 뷰티제품 마케팅 수요 데이터_날짜.xlsx</strong>
          </div>
        </div>
        <label className="export-password">
          <span>열람 암호 · 선택 (걸려면 6자 이상)</span>
          <div>
            <input
              type="text"
              value={password}
              placeholder="비워두면 암호 없이 내보냅니다"
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <button type="button" onClick={generatePassword}>
              자동 생성
            </button>
          </div>
        </label>
        {password.length > 0 && (
          <p className="export-warning">
            암호를 잊으면 문서를 다시 열 수 없습니다. 안전한 곳에 따로
            보관하세요.
          </p>
        )}
        <button
          className="primary"
          disabled={
            (password.length > 0 && password.length < 6) || phase === "busy"
          }
          onClick={run}
        >
          {phase === "busy"
            ? "문서 생성 중…"
            : password.length > 0
              ? "암호 걸어 내보내기"
              : "암호 없이 내보내기"}
        </button>
        {phase === "done" && (
          <p className="export-result ok">
            {password.length > 0
              ? "내보내기 완료 — 다운로드된 파일은 입력한 암호로만 열립니다."
              : "내보내기 완료 — 암호 없는 문서로 저장했습니다."}
          </p>
        )}
        {phase === "error" && (
          <p className="export-result error">
            내보내기에 실패했습니다. 잠시 후 다시 시도해 주세요.
          </p>
        )}
      </aside>
    </div>
  );
}

function Overview({
  manual,
  weights,
  onWeightsChange,
  onSelect,
}: {
  manual: Record<string, ManualRecord>;
  weights: ChannelWeights;
  onWeightsChange: (weights: ChannelWeights) => void;
  onSelect: (signal: Signal) => void;
}) {
  const channelScores = useMemo(
    () => buildChannelScores(allProducts, manual),
    [manual],
  );
  const top = useMemo(
    () =>
      allProducts
        .map((signal, originalIndex) => ({
          signal,
          originalIndex,
          scores: channelScores.get(signal.name) || ({} as ChannelScores),
        }))
        .map((item) => ({
          ...item,
          score: weightedScore(item.scores, weights),
        }))
        .sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex),
    [channelScores, weights],
  );
  const autoCount = allProducts.reduce(
    (n, s) =>
      n + platforms.filter((p) => statusOf(s, p.id, manual) === "auto").length,
    0,
  );
  const manualCount = Object.keys(manual).length;
  const [exportOpen, setExportOpen] = useState(false);
  const activePresetName =
    weightPresets.find((preset) =>
      platforms.every(
        (platform) => preset.weights[platform.id] === weights[platform.id],
      ),
    )?.name ?? "사용자 설정";
  const reportRows: ReportRow[] = top.map((item, index) => ({
    rank: index + 1,
    name: item.signal.name,
    score: item.score,
    coverage: scoreCoverage(item.scores, weights),
    keywords: item.signal.keywords,
    skuNames: item.signal.skuNames,
    channelScores: item.scores,
  }));
  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">ONLINE DEMAND SIGNALS</p>
          <h1>
            제품의 온라인 관심을
            <br />
            한곳에서 확인하세요
          </h1>
          <p className="hero-copy">
            약국 실매출을 보완하는 부가 지표입니다. 네이버, Google, YouTube,
            <br className="desktop" /> Instagram, TikTok의 관심 신호를 플랫폼별
            기준으로 정리합니다.
          </p>
        </div>
        <div className="hero-status">
          <span className="live-dot" />
          최근 수집 실행
          <strong>{collectedAtKst} KST</strong>
        </div>
      </section>
      <section className="metrics">
        <article>
          <p>등록 제품</p>
          <strong>
            {allProducts.length}
            <small>개 조사 제품</small>
          </strong>
          <span>조사할 전체 제품 목록</span>
        </article>
        <article>
          <p>수집 작업</p>
          <strong>
            {allProducts.length * 5}
            <small>건</small>
          </strong>
          <span>조사 제품 {allProducts.length} × 채널 5</span>
        </article>
        <article>
          <p>자동 확보</p>
          <strong>
            {autoCount}
            <small>건</small>
          </strong>
          <span>DataLab · YouTube · 공개 근거</span>
        </article>
        <article>
          <p>사람 확인 완료</p>
          <strong>
            {manualCount}
            <small>건</small>
          </strong>
          <span>현재 브라우저에 저장</span>
        </article>
      </section>
      <section className="panel ranking-panel">
        <div className="section-head">
          <div>
            <p className="section-kicker">가중치 기반 순위</p>
            <h2>온라인 수요 순위</h2>
          </div>
          <div className="ranking-actions">
            <span className="real-badge">제품을 눌러 상세 보기</span>
            <button
              className="export-button"
              onClick={() => setExportOpen(true)}
            >
              데이터 내보내기
            </button>
          </div>
        </div>
        <WeightControls weights={weights} onChange={onWeightsChange} scores={channelScores} />
        <p className="quality-note">
          점수는 통계 보정을 거친 값입니다. 여러 제품에 같은 콘텐츠가 채택된
          경우 조회수를 제품 수로 나눠 반영하고, 수집 기간(YouTube 365일 ·
          Instagram·TikTok 180일)을 벗어난 콘텐츠는 제외하며, 검색어 시도
          횟수 차이로 표본이 늘어나는 편향은 <b>상위 5개 콘텐츠 합계</b>로
          상한을 둡니다. 수집에 실패한 채널은 점수 분모에서 제외해 무벌점
          처리합니다. <b>판정 신뢰도</b>는 채널별 표본 수와 브랜드 특정성을
          종합한 결과로, <b>주의</b>·<b>표본 부족</b> 제품은 이 순위만으로
          &ldquo;실제로 핫하다&rdquo;고 판단할 수 없습니다.
        </p>
        {(qualityFile.meta as Quality)?.systemicIssues?.length > 0 && (
          <p className="quality-note systemic">
            {(qualityFile.meta as Quality).systemicIssues.map((issue: string) => (
              <span key={issue}>수집 공통 한계: {issue}</span>
            ))}
          </p>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>번호</th>
                <th>제품</th>
                <th>종합 점수</th>
                <th>판정 신뢰도</th>
                <th>대표 검색어</th>
                <th>수집 현황</th>
              </tr>
            </thead>
            <tbody>
              {top.map((item, i) => {
                const s = item.signal;
                const done = platforms.filter((x) =>
                  ["auto", "manual"].includes(statusOf(s, x.id, manual)),
                ).length;
                return (
                  <tr
                    key={s.name}
                    onClick={() => onSelect(s)}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && onSelect(s)}
                  >
                    <td>
                      <span className="rank">{i + 1}</span>
                    </td>
                    <td>
                      <strong>{s.name}</strong>
                      <small>
                        {s.skuNames.length}개 SKU 통합 ·{" "}
                        {s.keywords.join(" · ")}
                      </small>
                    </td>
                    <td>
                      <div className="demand-score">
                        <strong>{item.score.toFixed(1)}</strong>
                        <div className="signal">
                          <span style={{ width: `${item.score}%` }} />
                        </div>
                        <small>근거 {Math.round(scoreCoverage(item.scores, weights))}%</small>
                      </div>
                    </td>
                    <td>
                      {(() => {
                        const verdict =
                          verdictLabel[qualityOf(s.name)?.verdict ?? ""] ?? {
                            text: "미조사",
                            tone: "bad",
                          };
                        return (
                          <span className={`verdict-badge ${verdict.tone}`}>
                            {verdict.text}
                          </span>
                        );
                      })()}
                    </td>
                    <td>{s.keywords[0]}</td>
                    <td>
                      <div className="progress-label">
                        <b>{done}/5 확보</b>
                        <span>
                          {done === 5 ? "완료" : `${5 - done}개 확인 필요`}
                        </span>
                      </div>
                      <div className="signal progress">
                        <span style={{ width: `${done * 20}%` }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      {exportOpen && (
        <ExportDrawer
          presetName={activePresetName}
          weights={weights}
          rows={reportRows}
          manualCount={manualCount}
          onClose={() => setExportOpen(false)}
        />
      )}
    </>
  );
}

function Collection({
  manual,
  onOpen,
}: {
  manual: Record<string, ManualRecord>;
  onOpen: (s: Signal, p: Platform) => void;
}) {
  return (
    <section className="page-section">
      <div className="page-title">
        <p className="section-kicker">자동 수집 + 사람 확인</p>
        <h1>수요 데이터 수집</h1>
        <p>숫자만 남기지 않고 키워드, 수집 시각, 원본 URL을 함께 보관합니다.</p>
      </div>
      <div className="legend">
        <span>
          <i className="auto" />
          자동 수집
        </span>
        <span>
          <i className="manual" />
          사람 확인 완료
        </span>
        <span>
          <i className="needed" />
          사람 확인 필요
        </span>
        <span>
          <i className="blocked" />
          API 연결 필요
        </span>
      </div>
      <div className="collection-board">
        <div className="board-head">
          <span>제품 / 대표 키워드</span>
          {platforms.map((p) => (
            <span key={p.id}>{p.name}</span>
          ))}
        </div>
        {allProducts.map((s, i) => (
          <div className="board-row" key={s.name}>
            <div>
              <b>
                {i + 1}. {s.name}
              </b>
              <small>{s.keyword}</small>
            </div>
            {platforms.map((p) => {
              const status = statusOf(s, p.id, manual);
              const auto = getAuto(s, p.id);
              return (
                <button
                  key={p.id}
                  className={`task ${status}`}
                  onClick={() => onOpen(s, p.id)}
                >
                  <i />
                  {status === "auto"
                    ? p.id === "naver" && auto?.trend
                      ? `기준어 대비 ${auto.trend.anchorNormalizedLatest30}`
                      : p.id === "youtube"
                      ? `${auto?.resultSampleCount || 0}개 영상`
                      : p.id === "naver"
                        ? `${(auto?.blogResultSampleCount || 0) + (auto?.cafeResultSampleCount || 0)}개 링크`
                        : `${auto?.organicResultSampleCount || 0}개 결과`
                    : status === "manual"
                      ? "입력 완료"
                      : status === "needed"
                        ? "직접 확인"
                        : "연결 필요"}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="panel collection-note">
        <h3>플랫폼마다 수요 신호가 다릅니다</h3>
        <p>
          네이버는 DataLab 상대 검색지수, Google은 Trends 관심도, YouTube는
          조회수, Instagram과 TikTok은 게시물별 반응을 봅니다. 서로 다른 숫자를
          억지로 합치지 않고 원본 URL과 수집 시각을 남긴 뒤, 채널별 정규화 점수만
          비교합니다.
        </p>
      </div>
    </section>
  );
}

function Products({
  manual,
  weights,
  onWeightsChange,
  onOpen,
}: {
  manual: Record<string, ManualRecord>;
  weights: ChannelWeights;
  onWeightsChange: (weights: ChannelWeights) => void;
  onOpen: (s: Signal, p: Platform) => void;
}) {
  const [selected, setSelected] = useState(allProducts[0]);
  const channelScores = useMemo(
    () => buildChannelScores(allProducts, manual),
    [manual],
  );
  const sortedProducts = useMemo(
    () =>
      allProducts
        .map((signal, originalIndex) => ({
          signal,
          originalIndex,
          score: weightedScore(
            channelScores.get(signal.name) || ({} as ChannelScores),
            weights,
          ),
        }))
        .sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex),
    [channelScores, weights],
  );
  const selectedChannelScores =
    channelScores.get(selected.name) || ({} as ChannelScores);
  const selectedScore = weightedScore(selectedChannelScores, weights);
  return (
    <section className="page-section">
      <div className="page-title">
        <p className="section-kicker">채널별 온라인 근거</p>
        <h1>제품 검증</h1>
        <p>채널별 상대 점수와 적용 비중을 제품 단위로 확인합니다.</p>
      </div>
      <WeightControls weights={weights} onChange={onWeightsChange} scores={channelScores} />
      <div className="validation-layout">
        <div className="product-list">
          {sortedProducts.map(({ signal: s, score }, i) => (
            <button
              className={selected.name === s.name ? "active" : ""}
              onClick={() => setSelected(s)}
              key={s.name}
            >
              <span>{i + 1}</span>
              <div>
                <b>{s.name}</b>
                <small>{s.keyword}</small>
              </div>
              <em>{score.toFixed(1)}</em>
            </button>
          ))}
        </div>
        <div className="panel validation-detail">
          <span className="drawer-rank">제품 수요 조사</span>
          <h2>
            {selected.name}{" "}
            {(() => {
              const verdict = verdictLabel[qualityOf(selected.name)?.verdict ?? ""];
              return verdict ? (
                <span className={`verdict-badge ${verdict.tone}`}>{verdict.text}</span>
              ) : null;
            })()}
          </h2>
          <div className="selected-score">
            <div>
              <span>가중 종합 점수</span>
              <strong>{selectedScore.toFixed(1)}</strong>
              <small>
                근거 {Math.round(scoreCoverage(selectedChannelScores, weights))}%
              </small>
            </div>
            {platforms.map((platform) => {
              const channelQuality = qualityOf(selected.name)?.[platform.id];
              return (
                <div key={platform.id}>
                  <span>{platform.name}</span>
                  <strong>
                    {selectedChannelScores[platform.id] == null
                      ? "—"
                      : selectedChannelScores[platform.id]!.toFixed(1)}
                  </strong>
                  <small>
                    비중 {weights[platform.id]}
                    {channelQuality?.confidence
                      ? ` · 신뢰도 ${confidenceLabel[channelQuality.confidence]}`
                      : ""}
                  </small>
                </div>
              );
            })}
          </div>
          <div className="entity-rule validation-keywords">
            <b>대표 검색어</b>
            <p>{selected.keywords.join(" · ")}</p>
            <b>통합 제품</b>
            <p>{selected.skuNames.join(" · ")}</p>
          </div>
          {(qualityOf(selected.name)?.fairness?.suggestions?.length ?? 0) >
            0 && (
            <ul className="fairness-suggestions">
              {qualityOf(selected.name).fairness.suggestions.map(
                (suggestion: string) => (
                  <li key={suggestion}>{suggestion}</li>
                ),
              )}
            </ul>
          )}
          <h3>채널별 수집 근거</h3>
          <div className="evidence-list">
            {platforms.map((p) => {
              const st = statusOf(selected, p.id, manual);
              const a = getAuto(selected, p.id);
              return (
                <button onClick={() => onOpen(selected, p.id)} key={p.id}>
                  <span className={`status-dot ${st}`} />
                  <div>
                    <b>{p.name}</b>
                    <small>{p.rule}</small>
                  </div>
                  <strong>
                    {st === "auto"
                      ? "자동 수집됨"
                      : st === "manual"
                        ? "사람 확인됨"
                        : st === "needed"
                          ? "확인 필요"
                          : "연결 필요"}
                  </strong>
                  <i>›</i>
                </button>
              );
            })}
          </div>
          <div className="score-lock">
            <b>가중 점수 계산됨</b>
            <p>
              채널별 보정 수치를 상대 점수로 바꾼 뒤 현재 비중을 적용했습니다.
              수집에 실패한 채널은 점수 분모에서 제외하고, 측정 범위는 근거
              커버리지로 표시합니다.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Method() {
  return (
    <section className="page-section">
      <div className="page-title">
        <p className="section-kicker">회의 결정 반영</p>
        <h1>수집·검증 기준</h1>
        <p>
          먼저 공개 원천 데이터를 모으고, 관련성과 재현성을 확인한 뒤 가중치를
          조정합니다.
        </p>
      </div>
      <div className="method-grid">
        <article>
          <span>01</span>
          <h3>대표 키워드 정규화</h3>
          <p>
            용량과 SKU를 제거하고 브랜드·제품군·성분 키워드를 함께 관리합니다.
          </p>
        </article>
        <article>
          <span>02</span>
          <h3>전체 제품 순차 조사</h3>
          <p>
            등록된 전체 제품을 조사합니다. 채널 우선순위는 네이버 DataLab,
            Google Trends, YouTube, Instagram, TikTok 순입니다.
          </p>
        </article>
        <article>
          <span>03</span>
          <h3>원점수와 증빙 보존</h3>
          <p>
            게시물 수, 조회, 좋아요, 댓글, 공유, 검색 결과와 원본 URL을 그대로
            남깁니다.
          </p>
        </article>
        <article>
          <span>04</span>
          <h3>정규화 후 비중 조정</h3>
          <p>
            검색 관심도, 조회수, 반응 수처럼 단위가 다른 신호를 채널 안에서 먼저
            비교하고, 조사 목적에 맞는 비중을 슬라이더로 적용합니다.
          </p>
        </article>
      </div>
      <div className="formula">
        <span>5개 채널 원천 수집</span>
        <i>→</i>
        <span>이상치·광고 보정</span>
        <i>→</i>
        <span>채널별 정규화</span>
        <i>→</i>
        <strong>가중치별 순위 비교</strong>
      </div>
    </section>
  );
}

function ResearchWorkspace({
  manual,
  keywordDrafts,
  onKeywordChange,
  onOpen,
  onDelete,
  onExport,
  onImport,
  notice,
}: {
  manual: Record<string, ManualRecord>;
  keywordDrafts: Record<string, string>;
  onKeywordChange: (name: string, value: string) => void;
  onOpen: (signal: Signal, platform: Platform) => void;
  onDelete: (signal: Signal, platform: Platform) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  notice?: { tone: "ok" | "error"; text: string } | null;
}) {
  return (
    <section className="page-section">
      <div className="page-title">
        <p className="section-kicker">사람이 조사하고 근거를 남기는 곳</p>
        <h1>조사 관리</h1>
        <p>
          대표 검색어를 다듬고 채널별 수치, 근거 URL, 메모를 직접 기록하세요.
        </p>
      </div>
      <div className="workspace-summary">
        <div>
          <span>조사 대상</span>
          <strong>{allProducts.length}개 조사 제품</strong>
        </div>
        <div>
          <span>직접 입력 완료</span>
          <strong>
            {Object.keys(manual).length} / {allProducts.length * 5}건
          </strong>
        </div>
        <div>
          <span>저장 위치</span>
          <strong>현재 브라우저</strong>
        </div>
        <div className="workspace-actions">
          <button onClick={onExport}>JSON 내보내기</button>
          <label>
            JSON 가져오기
            <input
              type="file"
              accept="application/json"
              onChange={(event) =>
                event.target.files?.[0] && onImport(event.target.files[0])
              }
            />
          </label>
        </div>
      </div>
      {notice && (
        <div
          className={`storage-notice ${
            notice.tone === "error" ? "notice-error" : "notice-ok"
          }`}
          role="status"
        >
          {notice.text}
        </div>
      )}
      <div className="storage-notice">
        공개 방문자가 서로의 데이터를 덮어쓰지 않도록 브라우저별로 저장합니다.
        다른 PC로 옮길 때는 JSON을 내보내고 가져오세요.
      </div>
      <div className="research-list">
        {allProducts.map((signal, index) => (
          <article className="research-card" key={signal.name}>
            <div className="research-card-head">
              <div>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h2>{signal.name}</h2>
                <p>{signal.skuNames.length}개 SKU 통합</p>
              </div>
              <small>
                {
                  platforms.filter(
                    (platform) => manual[`${signal.name}::${platform.id}`],
                  ).length
                }
                /5 직접 입력
              </small>
            </div>
            <label className="keyword-editor">
              <span>대표 검색어 · 쉼표로 구분</span>
              <input
                value={keywordDrafts[signal.name] ?? signal.keywords.join(", ")}
                onChange={(event) =>
                  onKeywordChange(signal.name, event.target.value)
                }
              />
              <small>{signal.reason}</small>
            </label>
            {(qualityOf(signal.name)?.fairness?.suggestions?.length ?? 0) >
              0 && (
              <ul className="fairness-suggestions">
                {qualityOf(signal.name).fairness.suggestions.map(
                  (suggestion: string) => (
                    <li key={suggestion}>{suggestion}</li>
                  ),
                )}
              </ul>
            )}
            <div className="channel-editor">
              {platforms.map((platform) => {
                const record = manual[`${signal.name}::${platform.id}`];
                return (
                  <div
                    className={
                      record ? "channel-item complete" : "channel-item"
                    }
                    key={platform.id}
                  >
                    <button
                      onClick={() =>
                        onOpen(
                          {
                            ...signal,
                            keywords: (
                              keywordDrafts[signal.name] ??
                              signal.keywords.join(",")
                            )
                              .split(",")
                              .map((keyword) => keyword.trim())
                              .filter(Boolean),
                          },
                          platform.id,
                        )
                      }
                    >
                      <span>{platform.name}</span>
                      <b>{record ? "수정" : "입력"}</b>
                      <small>
                        {record?.evidenceUrl ? "근거 URL 있음" : "근거 필요"}
                      </small>
                    </button>
                    {record && (
                      <button
                        className="record-delete"
                        aria-label={`${platform.name} 조사값 삭제`}
                        onClick={() => onDelete(signal, platform.id)}
                      >
                        삭제
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  const [view, setView] = useState<
    "pharmacy" | "overview" | "collection" | "products" | "method" | "guide"
  >("pharmacy");
  const [importNotice, setImportNotice] = useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);
  const [manual, setManual] = useState<Record<string, ManualRecord>>({});
  const [weights, setWeights] = useState<ChannelWeights>(recommendedWeights);
  const [keywordDrafts, setKeywordDrafts] = useState<Record<string, string>>(
    {},
  );
  const [open, setOpen] = useState<{
    signal: Signal;
    platform: Platform;
  } | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Signal | null>(null);
  useEffect(() => {
    if (!importNotice) return;
    const timer = window.setTimeout(() => setImportNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [importNotice]);
  useEffect(() => {
    const modalOpen = Boolean(selectedProduct || open);
    if (!modalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedProduct, open]);
  useEffect(() => {
    try {
      setManual(
        JSON.parse(localStorage.getItem("demand-manual-records") || "{}"),
      );
      setKeywordDrafts(
        JSON.parse(localStorage.getItem("demand-keyword-drafts") || "{}"),
      );
      const storedWeights = JSON.parse(
        localStorage.getItem("demand-channel-weights") || "null",
      );
      if (
        storedWeights &&
        platforms.every((platform) =>
          Number.isFinite(Number(storedWeights[platform.id])),
        )
      ) {
        setWeights(
          Object.fromEntries(
            platforms.map((platform) => [
              platform.id,
              Math.max(0, Math.min(100, Number(storedWeights[platform.id]))),
            ]),
          ) as ChannelWeights,
        );
      }
    } catch {}
  }, []);
  const updateWeights = (next: ChannelWeights) => {
    setWeights(next);
    localStorage.setItem("demand-channel-weights", JSON.stringify(next));
  };
  const save = (record: ManualRecord) => {
    if (!open) return;
    const next = {
      ...manual,
      [`${open.signal.name}::${open.platform}`]: record,
    };
    setManual(next);
    localStorage.setItem("demand-manual-records", JSON.stringify(next));
    setOpen(null);
  };
  const removeRecord = (signal: Signal, platform: Platform) => {
    const next = { ...manual };
    delete next[`${signal.name}::${platform}`];
    setManual(next);
    localStorage.setItem("demand-manual-records", JSON.stringify(next));
  };
  const updateKeyword = (name: string, value: string) => {
    const next = { ...keywordDrafts, [name]: value };
    setKeywordDrafts(next);
    localStorage.setItem("demand-keyword-drafts", JSON.stringify(next));
  };
  const exportWorkspace = () => {
    const payload = JSON.stringify(
      {
        version: 1,
        exportedAt: new Date().toISOString(),
        manual,
        keywordDrafts,
        weights,
      },
      null,
      2,
    );
    const url = URL.createObjectURL(
      new Blob([payload], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "wellnessbox-demand-research.json";
    link.click();
    URL.revokeObjectURL(url);
  };
  const importWorkspace = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      if (
        !parsed ||
        typeof parsed.manual !== "object" ||
        typeof parsed.keywordDrafts !== "object"
      )
        throw new Error("invalid workspace file");
      setManual(parsed.manual);
      setKeywordDrafts(parsed.keywordDrafts);
      if (parsed.weights) updateWeights(parsed.weights);
      localStorage.setItem(
        "demand-manual-records",
        JSON.stringify(parsed.manual),
      );
      localStorage.setItem(
        "demand-keyword-drafts",
        JSON.stringify(parsed.keywordDrafts),
      );
      setImportNotice({ tone: "ok", text: "조사 데이터를 가져왔습니다." });
    } catch {
      setImportNotice({
        tone: "error",
        text: "올바른 조사 데이터 JSON 파일이 아닙니다.",
      });
    }
  };
  useRevealOnScroll([view]);
  const mainNav = [["pharmacy", "약국 실매출", "⌂"]] as const;
  const researchNav = [
    ["overview", "온라인 수요 신호", "⌁"],
    ["collection", "데이터 수집", "◎"],
    ["products", "제품 검증", "▦"],
    ["method", "조사 관리", "◇"],
    ["guide", "수집·검증 기준", "✦"],
  ] as const;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand" onClick={() => setView("pharmacy")}>
          <img src="/wellnessbox-mark.png" alt="" width={34} height={34} />
          <div>
            Wellnessbox<small>뷰티 약국 수요 데이터</small>
          </div>
        </div>
        <nav>
          {mainNav.map((n) => (
            <button
              key={n[0]}
              className={view === n[0] ? "active" : ""}
              onClick={() => setView(n[0])}
            >
              <i>{n[2]}</i>
              {n[1]}
            </button>
          ))}
          <span className="nav-group">온라인 수요 리서치</span>
          {researchNav.map((n) => (
            <button
              key={n[0]}
              className={view === n[0] ? "active" : ""}
              onClick={() => setView(n[0])}
            >
              <i>{n[2]}</i>
              {n[1]}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="live-dot" />
          데이터 파이프라인
          <small>파트너 약국 4지점 · 조사 제품 {allProducts.length}개</small>
        </div>
      </aside>
      <main>
        {view === "pharmacy" && <PharmacyView />}{" "}
        {view === "overview" && (
          <Overview
            manual={manual}
            weights={weights}
            onWeightsChange={updateWeights}
            onSelect={setSelectedProduct}
          />
        )}{" "}
        {view === "collection" && (
          <Collection
            manual={manual}
            onOpen={(signal, platform) => setOpen({ signal, platform })}
          />
        )}{" "}
        {view === "products" && (
          <Products
            manual={manual}
            weights={weights}
            onWeightsChange={updateWeights}
            onOpen={(signal, platform) => setOpen({ signal, platform })}
          />
        )}{" "}
        {view === "method" && (
          <ResearchWorkspace
            manual={manual}
            keywordDrafts={keywordDrafts}
            onKeywordChange={updateKeyword}
            onOpen={(signal, platform) => setOpen({ signal, platform })}
            onDelete={removeRecord}
            onExport={exportWorkspace}
            onImport={importWorkspace}
            notice={importNotice}
          />
        )}{" "}
        {view === "guide" && <Method />}
        <footer className="site-footer reveal">
          <div className="footer-top">
            <div>
              <img
                src="/wellnessbox-wordmark.png"
                alt="Wellnessbox"
                height={22}
              />
              <p>뷰티 약국 실매출과 온라인 수요 신호를 한곳에서.</p>
            </div>
            <div className="footer-contact">
              <span>파트너십 문의</span>
              <a href="mailto:contact@wellnessbox.kr">contact@wellnessbox.kr</a>
              <a href="tel:02-6241-5530">02-6241-5530</a>
            </div>
          </div>
          <div className="footer-info">
            <p>
              주식회사 웰니스박스 · 대표 권혁찬 · 사업자등록번호 728-88-03267 ·
              통신판매업신고 제2025-서울동대문-1562호
            </p>
            <p>서울특별시 광진구 광나루로 520, 4층 402호(구의동, 신용보증기금)</p>
            <p className="footer-copy">
              © 2026 Wellnessbox Inc. All rights reserved.
            </p>
          </div>
        </footer>
      </main>
      {selectedProduct && (
        <ProductDrawer
          signal={selectedProduct}
          manual={manual}
          onClose={() => setSelectedProduct(null)}
          onOpen={(platform) => {
            setSelectedProduct(null);
            setOpen({ signal: selectedProduct, platform });
          }}
        />
      )}{" "}
      {open && (
        <CollectionDrawer
          signal={open.signal}
          platform={open.platform}
          existing={manual[`${open.signal.name}::${open.platform}`]}
          onClose={() => setOpen(null)}
          onSave={save}
          onDelete={() => removeRecord(open.signal, open.platform)}
        />
      )}
    </div>
  );
}
