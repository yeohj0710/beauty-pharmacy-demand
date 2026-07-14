"use client";

import { useEffect, useMemo, useState } from "react";
import catalog from "./product-catalog.json";
import signalFile from "./signals.json";

type Signal = any;
type Platform = "youtube" | "instagram" | "tiktok" | "naver" | "google";
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
    id: "youtube",
    name: "YouTube",
    rule: "최근 365일 · 상위 20개 검토 · 관련 영상 최대 10개 · Shorts 분리",
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
  {
    id: "naver",
    name: "네이버",
    rule: "통합검색·VIEW 상위 20개 검토 · 관련 결과 최대 10개 · 체험단 분리",
  },
  {
    id: "google",
    name: "Google",
    rule: "자연검색 상위 20개 검토 · 관련 결과 최대 10개 · 광고·쇼핑 제외",
  },
];
const knownSkuNames = new Set(
  signalFile.products.flatMap((product) => product.skuNames),
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
  return auto?.status === "collected"
    ? "auto"
    : auto?.status === "manual_required"
      ? "needed"
      : "blocked";
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
      >
        <button className="close" onClick={onClose}>
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
                <strong>
                  블로그 {fmt(auto.blogResultSampleCount)}개 · 카페{" "}
                  {fmt(auto.cafeResultSampleCount)}개
                </strong>
                <p>공개 검색 첫 화면에서 확인된 링크 표본입니다.</p>
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
      >
        <button className="close" onClick={onClose}>
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
                  <small>{p.rule}</small>
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
            <b>수요 점수 계산 전</b>
            <p>
              채널별 근거가 모이면 제품의 온라인 관심 흐름을 한눈에 비교할 수
              있습니다.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Overview({
  manual,
  onSelect,
}: {
  manual: Record<string, ManualRecord>;
  onSelect: (signal: Signal) => void;
}) {
  const top = allProducts;
  const autoCount = allProducts.reduce(
    (n, s) =>
      n + platforms.filter((p) => statusOf(s, p.id, manual) === "auto").length,
    0,
  );
  const manualCount = Object.keys(manual).length;
  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">PRODUCT DEMAND RESEARCH</p>
          <h1>
            제품의 온라인 관심을
            <br />
            한곳에서 확인하세요
          </h1>
          <p className="hero-copy">
            등록된 제품을 YouTube, Instagram, TikTok, 네이버, Google에서
            <br className="desktop" /> 같은 기준으로 조사하고 근거와 함께
            정리합니다.
          </p>
        </div>
        <div className="hero-status">
          <span className="live-dot" />
          최근 수집 실행
          <strong>
            {new Date(signalFile.collectedAt).toLocaleString("ko-KR")}
          </strong>
        </div>
      </section>
      <section className="metrics">
        <article>
          <p>등록 제품</p>
          <strong>
            {allProducts.length}
            <small>개 수요 개체</small>
          </strong>
          <span>조사할 전체 제품 목록</span>
        </article>
        <article>
          <p>수집 작업</p>
          <strong>
            {allProducts.length * 5}
            <small>건</small>
          </strong>
          <span>수요 개체 {allProducts.length} × 채널 5</span>
        </article>
        <article>
          <p>자동 확보</p>
          <strong>
            {autoCount}
            <small>건</small>
          </strong>
          <span>YouTube · 네이버 공개 표본</span>
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
            <p className="section-kicker">제품명 기준</p>
            <h2>수요를 조사할 제품</h2>
          </div>
          <span className="real-badge">제품을 눌러 상세 보기</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>번호</th>
                <th>제품</th>
                <th>통합 제품</th>
                <th>대표 검색어</th>
                <th>수집 현황</th>
              </tr>
            </thead>
            <tbody>
              {top.map((p, i) => {
                const s = p;
                const done = platforms.filter((x) =>
                  ["auto", "manual"].includes(statusOf(s, x.id, manual)),
                ).length;
                return (
                  <tr
                    key={p.name}
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
                      <strong>{s.skuNames.length}개 SKU</strong>
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
                    ? p.id === "youtube"
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
        <h3>왜 자동·수동을 섞나요?</h3>
        <p>
          Instagram과 TikTok은 로그인·모바일 조회 또는 승인된 API가 필요합니다.
          억지로 가짜 점수를 만들지 않고, 담당자가 같은 기준으로 확인해 증빙
          URL과 함께 기록하도록 했습니다. YouTube·네이버·Google도 공개 검색
          표본과 공식 API 전체값을 구분합니다.
        </p>
      </div>
    </section>
  );
}

function Products({
  manual,
  onOpen,
}: {
  manual: Record<string, ManualRecord>;
  onOpen: (s: Signal, p: Platform) => void;
}) {
  const [selected, setSelected] = useState(allProducts[0]);
  return (
    <section className="page-section">
      <div className="page-title">
        <p className="section-kicker">판매 × 온라인 근거</p>
        <h1>제품 검증</h1>
        <p>온라인 점수는 5개 채널 수집이 끝난 뒤에만 계산합니다.</p>
      </div>
      <div className="validation-layout">
        <div className="product-list">
          {allProducts.map((s, i) => (
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
            </button>
          ))}
        </div>
        <div className="panel validation-detail">
          <span className="drawer-rank">제품 수요 조사</span>
          <h2>{selected.name}</h2>
          <div className="entity-rule validation-keywords">
            <b>대표 검색어</b>
            <p>{selected.keywords.join(" · ")}</p>
            <b>통합 제품</b>
            <p>{selected.skuNames.join(" · ")}</p>
          </div>
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
            <b>종합 수요 점수 잠김</b>
            <p>
              5개 채널의 수집 기준이 충족되기 전에는 점수를 노출하지 않습니다.
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
          먼저 원천 데이터를 모으고, 실제 판매와 맞는지 확인한 뒤 가중치를
          정합니다.
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
          <h3>상위 10개 MVP</h3>
          <p>
            전체 제품을 한 번에 긁지 않고 판매 상위 제품부터 5개 채널의 수집
            가능성을 검증합니다.
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
          <h3>실판매 상관 검증</h3>
          <p>
            30일 환산 판매 순위와 온라인 순위의 일치도를 확인한 후 플랫폼
            가중치를 결정합니다.
          </p>
        </article>
      </div>
      <div className="formula">
        <span>5개 채널 원천 수집</span>
        <i>→</i>
        <span>이상치·광고 보정</span>
        <i>→</i>
        <span>실판매 순위 비교</span>
        <i>→</i>
        <strong>가중치 확정</strong>
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
}: {
  manual: Record<string, ManualRecord>;
  keywordDrafts: Record<string, string>;
  onKeywordChange: (name: string, value: string) => void;
  onOpen: (signal: Signal, platform: Platform) => void;
  onDelete: (signal: Signal, platform: Platform) => void;
  onExport: () => void;
  onImport: (file: File) => void;
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
          <strong>{allProducts.length}개 수요 개체</strong>
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
    "overview" | "collection" | "products" | "method"
  >("overview");
  const [manual, setManual] = useState<Record<string, ManualRecord>>({});
  const [keywordDrafts, setKeywordDrafts] = useState<Record<string, string>>(
    {},
  );
  const [open, setOpen] = useState<{
    signal: Signal;
    platform: Platform;
  } | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Signal | null>(null);
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
    } catch {}
  }, []);
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
      localStorage.setItem(
        "demand-manual-records",
        JSON.stringify(parsed.manual),
      );
      localStorage.setItem(
        "demand-keyword-drafts",
        JSON.stringify(parsed.keywordDrafts),
      );
      window.alert("조사 데이터를 가져왔습니다.");
    } catch {
      window.alert("올바른 조사 데이터 JSON 파일이 아닙니다.");
    }
  };
  const nav = [
    ["overview", "수요 개요", "⌁"],
    ["collection", "데이터 수집", "◎"],
    ["products", "제품 검증", "▦"],
    ["method", "조사 관리", "◇"],
  ] as const;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand" onClick={() => setView("overview")}>
          <span>W</span>
          <div>
            웰니스박스<small>제품 수요 대시보드</small>
          </div>
        </div>
        <nav>
          {nav.map((n) => (
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
          수집 파이프라인
          <small>{allProducts.length}개 수요 개체 · 5개 채널</small>
        </div>
      </aside>
      <main>
        {view === "overview" && (
          <Overview manual={manual} onSelect={setSelectedProduct} />
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
          />
        )}
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
