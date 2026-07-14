"use client";

import { useEffect, useMemo, useState } from "react";
import sales from "./sales-data.json";
import signalFile from "./signals.json";

type Sales = (typeof sales)[number];
type Signal = (typeof signalFile.products)[number];
type Platform = "youtube" | "instagram" | "tiktok" | "naver" | "google";
type ManualRecord = {
  contentCount: string;
  views: string;
  likes: string;
  comments: string;
  shares: string;
  evidenceUrl: string;
  note: string;
  collectedAt: string;
};

const platforms: { id: Platform; name: string; rule: string }[] = [
  {
    id: "youtube",
    name: "YouTube",
    rule: "콘텐츠 수 · 조회수 · 좋아요 · 댓글",
  },
  {
    id: "instagram",
    name: "Instagram",
    rule: "최근 7일 릴스 · 조회수 · 반응 · 광고 구분",
  },
  {
    id: "tiktok",
    name: "TikTok",
    rule: "영상 수 · 조회수 · 좋아요 · 댓글 · 공유",
  },
  { id: "naver", name: "네이버", rule: "검색 노출 · 블로그 · 카페 결과" },
  { id: "google", name: "Google", rule: "검색 결과 · Trends 관심도" },
];
const money = (v: number) =>
  `${Math.round(v / 10000).toLocaleString("ko-KR")}만원`;
const fmt = (v?: number | null) =>
  v == null ? "—" : v.toLocaleString("ko-KR");

function saleFor(signal: Signal) {
  const rows = sales.filter((row) => signal.skuNames.includes(row.name));
  const revenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const profit = rows.reduce((sum, row) => sum + row.profit, 0);
  return {
    revenue,
    profit,
    units: rows.reduce((sum, row) => sum + row.units, 0),
    margin: revenue ? Math.round((profit / revenue) * 1000) / 10 : 0,
  };
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
  return auto?.status === "collected"
    ? "auto"
    : auto?.status === "manual_required"
      ? "needed"
      : "blocked";
}

function CollectionDrawer({
  signal,
  platform,
  onClose,
  onSave,
}: {
  signal: Signal;
  platform: Platform;
  onClose: () => void;
  onSave: (record: ManualRecord) => void;
}) {
  const meta = platforms.find((p) => p.id === platform)!;
  const auto = getAuto(signal, platform);
  const [form, setForm] = useState<ManualRecord>({
    contentCount: "",
    views: "",
    likes: "",
    comments: "",
    shares: "",
    evidenceUrl: auto?.sourceUrl || "",
    note: "",
    collectedAt: new Date().toISOString(),
  });
  const field = (
    key: keyof ManualRecord,
    label: string,
    placeholder = "숫자 입력",
  ) => (
    <label>
      <span>{label}</span>
      <input
        value={form[key]}
        placeholder={placeholder}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </label>
  );
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
          <h3>수동 확인값 기록</h3>
          <div className="form-grid">
            {field("contentCount", "콘텐츠 수")}
            {field("views", "조회수 합계")}
            {field("likes", "좋아요 합계")}
            {field("comments", "댓글 합계")}
            {field("shares", "공유 합계")}
          </div>
          {field("evidenceUrl", "증빙 URL", "https://...")}
          {field("note", "메모", "검색 조건, 광고 제외 기준 등")}
          <button
            className="primary"
            onClick={() =>
              onSave({ ...form, collectedAt: new Date().toISOString() })
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
  const sale = saleFor(signal);
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <button className="close" onClick={onClose}>
          ×
        </button>
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
        <div className="sale-facts drawer-facts">
          <div>
            <span>30일 매출</span>
            <strong>{money(sale.revenue)}</strong>
          </div>
          <div>
            <span>판매량</span>
            <strong>{fmt(sale.units)}개</strong>
          </div>
          <div>
            <span>순이익</span>
            <strong>{money(sale.profit)}</strong>
          </div>
          <div>
            <span>이익률</span>
            <strong>{sale.margin}%</strong>
          </div>
        </div>
        <h3 className="drawer-heading">채널별 수집 현황</h3>
        <div className="evidence-list">
          {platforms.map((p) => {
            const st = statusOf(signal, p.id, manual);
            return (
              <button key={p.id} onClick={() => onOpen(p.id)}>
                <span className={`status-dot ${st}`} />
                <div>
                  <b>{p.name}</b>
                  <small>{p.rule}</small>
                </div>
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
          <p>5개 채널 근거가 모두 확보되면 실판매와 비교할 수 있습니다.</p>
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
  const top = [...signalFile.products].sort(
    (a, b) => saleFor(b).revenue - saleFor(a).revenue,
  );
  const autoCount = signalFile.products.reduce(
    (n, s) =>
      n + platforms.filter((p) => statusOf(s, p.id, manual) === "auto").length,
    0,
  );
  const manualCount = Object.keys(manual).length;
  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">PRODUCT DEMAND COLLECTION</p>
          <h1>
            판매 결과가 아니라,
            <br />
            수요 근거를 모읍니다
          </h1>
          <p className="hero-copy">
            상위 10개 제품을 5개 채널에서 같은 기준으로 조사하고
            <br className="desktop" /> 실제 약국 판매와 일치하는지 검증합니다.
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
          <p>MVP 대상</p>
          <strong>
            {signalFile.products.length}<small>개 수요 개체</small>
          </strong>
          <span>30일 매출 상위 제품</span>
        </article>
        <article>
          <p>수집 작업</p>
          <strong>
            {signalFile.products.length * 5}<small>건</small>
          </strong>
          <span>수요 개체 {signalFile.products.length} × 채널 5</span>
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
            <p className="section-kicker">실판매 기준선</p>
            <h2>검증할 상위 10개 제품</h2>
          </div>
          <span className="real-badge">제품을 눌러 상세 보기</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>순위</th>
                <th>제품</th>
                <th>30일 매출</th>
                <th>판매</th>
                <th>순이익</th>
                <th>수집 현황</th>
              </tr>
            </thead>
            <tbody>
              {top.map((p, i) => {
                const s = p;
                const sale = saleFor(s);
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
                      <small>{s.skuNames.length}개 SKU 통합 · {s.keywords.join(" · ")}</small>
                    </td>
                    <td>
                      <strong>{money(sale.revenue)}</strong>
                    </td>
                    <td>{fmt(sale.units)}개</td>
                    <td>{money(sale.profit)}</td>
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
        {signalFile.products.map((s, i) => (
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
  const [selected, setSelected] = useState(signalFile.products[0]);
  const sale = saleFor(selected);
  return (
    <section className="page-section">
      <div className="page-title">
        <p className="section-kicker">판매 × 온라인 근거</p>
        <h1>제품 검증</h1>
        <p>온라인 점수는 5개 채널 수집이 끝난 뒤에만 계산합니다.</p>
      </div>
      <div className="validation-layout">
        <div className="product-list">
          {signalFile.products.map((s, i) => (
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
          <span className="drawer-rank">실판매 기준</span>
          <h2>{selected.name}</h2>
          <div className="sale-facts">
            <div>
              <span>30일 매출</span>
              <strong>{money(sale.revenue)}</strong>
            </div>
            <div>
              <span>판매량</span>
              <strong>{fmt(sale.units)}개</strong>
            </div>
            <div>
              <span>순이익</span>
              <strong>{money(sale.profit)}</strong>
            </div>
            <div>
              <span>이익률</span>
              <strong>{sale.margin}%</strong>
            </div>
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

export default function Home() {
  const [view, setView] = useState<
    "overview" | "collection" | "products" | "method"
  >("overview");
  const [manual, setManual] = useState<Record<string, ManualRecord>>({});
  const [open, setOpen] = useState<{
    signal: Signal;
    platform: Platform;
  } | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Signal | null>(null);
  useEffect(() => {
    try {
      setManual(
        JSON.parse(localStorage.getItem("demand-manual-records") || "{}"),
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
  const nav = [
    ["overview", "수요 개요", "⌁"],
    ["collection", "데이터 수집", "◎"],
    ["products", "제품 검증", "▦"],
    ["method", "수집 기준", "◇"],
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
          수집 파이프라인<small>상위 10개 · 5개 채널</small>
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
        {view === "method" && <Method />}
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
          onClose={() => setOpen(null)}
          onSave={save}
        />
      )}
    </div>
  );
}
