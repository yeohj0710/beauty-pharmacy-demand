"use client";

import { useEffect, useMemo, useState } from "react";
import demandEntities from "./demand-entities.json";
import productAssets from "./product-assets.json";
import {
  decryptPharmacySales,
  pharmacies,
  type Pharmacy,
  type PharmacyDataFile,
  type PharmacySales,
  type SalesPeriod,
  type SalesRow,
} from "./pharmacy-data";

const fmt = (value?: number | null) =>
  value == null ? "—" : Math.round(value).toLocaleString("ko-KR");
const fmtWon = (value?: number | null) => {
  if (value == null) return "—";
  const abs = Math.abs(value);
  if (abs >= 100000000) return `${(value / 100000000).toFixed(1)}억`;
  if (abs >= 10000)
    return `${Math.round(value / 10000).toLocaleString("ko-KR")}만`;
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
};
const fmtPct = (value?: number | null, digits = 1) =>
  value == null ? "—" : `${value.toFixed(digits)}%`;
// KPI 카드처럼 단위(<small>원</small>)를 따로 붙이는 자리용 — "원" 중복 방지
const fmtWonBare = (value: number) => fmtWon(value).replace(/원$/, "");

const assetBySalesName = new Map(
  demandEntities.flatMap((entity) => {
    const asset = productAssets.find((item) => item.entityId === entity.id);
    return [...entity.skuNames, ...(entity.sourceAliases ?? []), entity.name].map((name) => [name, asset] as const);
  }),
);

// 스크롤 진입 시 .reveal 요소를 순차적으로 띄운다.
export function useRevealOnScroll(deps: unknown[]) {
  useEffect(() => {
    const elements = document.querySelectorAll<HTMLElement>(".reveal:not(.in)");
    if (!elements.length) return;
    if (!("IntersectionObserver" in window)) {
      elements.forEach((element) => element.classList.add("in"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        // 같은 화면에 함께 들어온 요소는 순차적으로 떠오르게 지연을 준다.
        let order = 0;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const element = entry.target as HTMLElement;
          element.style.transitionDelay = `${Math.min(order * 110, 440)}ms`;
          element.classList.add("in");
          observer.unobserve(element);
          order += 1;
        }
      },
      { threshold: 0.1 },
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// KPI 숫자를 부드럽게 올라가는 카운트로 표시한다.
function useCountUp(target: number | null | undefined, duration = 850) {
  const [value, setValue] = useState<number | null>(null);
  useEffect(() => {
    let frame = 0;
    let started = 0;
    const tick = (now: number) => {
      if (target == null) {
        setValue(null);
        return;
      }
      if (!started) started = now;
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(target * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    // 탭이 백그라운드면 rAF가 멈추므로 최종값 확정을 보장한다.
    const settle = window.setTimeout(() => setValue(target ?? null), duration + 120);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(settle);
    };
  }, [target, duration]);
  return target == null ? null : (value ?? 0);
}

type SortKey = "qty" | "sales" | "profit" | "marginPct";
type SortState = { key: SortKey | null; dir: "desc" | "asc" };

const sortColumns: { key: SortKey; label: string }[] = [
  { key: "qty", label: "판매수량" },
  { key: "sales", label: "판매금액" },
  { key: "profit", label: "순이익" },
  { key: "marginPct", label: "이익률" },
];

const groupTone: Record<string, string> = {
  화장품: "beauty",
  일반의약품: "otc",
  "이너뷰티·건강식품": "inner",
  "의약외품·잡화": "etc",
  기타: "etc",
};

function productGroup(data: PharmacySales, name: string) {
  return data.products[name]?.group ?? "기타";
}

function PharmacyPicker({
  selected,
  onSelect,
}: {
  selected: Pharmacy;
  onSelect: (pharmacy: Pharmacy) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pharmacy-picker">
      <button
        className="pharmacy-picker-trigger"
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="pharmacy-picker-label">지점 선택</span>
        <strong>{selected.name}</strong>
        <small>{selected.area}</small>
        <i>{open ? "▴" : "▾"}</i>
      </button>
      {open && (
        <>
          <div
            className="pharmacy-picker-backdrop"
            onClick={() => setOpen(false)}
          />
          <ul className="pharmacy-picker-menu" role="listbox">
            {pharmacies.map((pharmacy) => (
              <li key={pharmacy.id}>
                <button
                  className={pharmacy.id === selected.id ? "active" : ""}
                  role="option"
                  aria-selected={pharmacy.id === selected.id}
                  onClick={() => {
                    onSelect(pharmacy);
                    setOpen(false);
                  }}
                >
                  <div>
                    <b>{pharmacy.name}</b>
                    <small>
                      {pharmacy.area} · {pharmacy.tags.join(" · ")}
                    </small>
                  </div>
                  <span className="branch-badge live">실매출 연동</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function SalesGate({
  onUnlock,
}: {
  onUnlock: (data: PharmacyDataFile) => void;
}) {
  const [password, setPassword] = useState("");
  const [phase, setPhase] = useState<"idle" | "busy" | "error">("idle");
  const submit = async () => {
    if (!password || phase === "busy") return;
    setPhase("busy");
    try {
      // 새로고침하면 다시 잠긴다 — 암호를 어디에도 저장하지 않는다.
      const data = await decryptPharmacySales(password);
      onUnlock(data);
    } catch {
      setPhase("error");
    }
  };
  return (
    <section className="gate-stage reveal" aria-label="실매출 데이터 열람 보호">
      <div className="gate-backdrop" aria-hidden>
        {[38, 62, 46, 78, 55, 90, 70, 84, 60, 96].map((height, index) => (
          <i key={index} style={{ height: `${height}%` }} />
        ))}
      </div>
      <div className="gate-card">
        <img
          className="gate-mark"
          src="/wellnessbox-mark.png"
          alt="Wellnessbox"
          width={46}
          height={46}
        />
        <span className="gate-kicker">Partner Data Room</span>
        <h2>실매출 데이터 열람</h2>
        <p>
          파트너 약국의 영업 데이터입니다.
          <br />
          열람 암호를 입력하면 바로 확인할 수 있습니다.
        </p>
        <form
          className="gate-form"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <input
            type="password"
            autoComplete="off"
            placeholder="열람 암호를 입력하세요"
            aria-label="열람 암호"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              if (phase === "error") setPhase("idle");
            }}
          />
          <button className="primary" type="submit" disabled={phase === "busy"}>
            {phase === "busy" ? "확인 중…" : "열람하기"}
          </button>
        </form>
        {phase === "error" && (
          <p className="gate-error">열람 암호가 올바르지 않습니다.</p>
        )}
        <ul className="gate-meta">
          <li>AES-256 암호화</li>
          <li>지점별 열람 권한</li>
          <li>닫으면 자동 잠금</li>
        </ul>
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  format,
  suffix,
  caption,
}: {
  label: string;
  value: number | null | undefined;
  format: (value: number) => string;
  suffix: string;
  caption: string;
}) {
  const animated = useCountUp(value);
  return (
    <article>
      <p>{label}</p>
      <strong>
        {animated == null ? "—" : format(animated)}
        <small>{suffix}</small>
      </strong>
      <span>{caption}</span>
    </article>
  );
}

function ProductSalesDrawer({
  data,
  name,
  onClose,
}: {
  data: PharmacySales;
  name: string;
  onClose: () => void;
}) {
  const info = data.products[name];
  const group = productGroup(data, name);
  const asset = assetBySalesName.get(name);
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer sales-drawer"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${name} 판매 상세`}
      >
        <button className="close" onClick={onClose} aria-label="닫기">
          ×
        </button>
        <div className="sales-drawer-head">
          <span className="drawer-rank">제품 판매 상세</span>
          <h2>
            {name}{" "}
            <span className={`cat-badge ${groupTone[group] ?? "etc"}`}>
              {group}
            </span>
          </h2>
          {asset?.localImagePath && (
            <div className="product-asset">
              <img src={asset.localImagePath} alt={`${name} 제품 이미지`} />
              <div>
                <span>{asset.brand}</span>
                <a href={asset.sourcePageUrl} target="_blank" rel="noreferrer">
                  이미지 출처 확인
                </a>
              </div>
            </div>
          )}
          {info && (
            <dl className="product-facts">
              <div>
                <dt>제조·브랜드</dt>
                <dd>{info.brand || "—"}</dd>
              </div>
              <div>
                <dt>주요 성분·특징</dt>
                <dd>{info.feature || "—"}</dd>
              </div>
              <div>
                <dt>용도</dt>
                <dd>{info.use || "—"}</dd>
              </div>
            </dl>
          )}
        </div>
        <div className="sales-drawer-body">
          {data.periods.map((period) => {
            const row = period.rows.find((item) => item.name === name);
            if (!row) return null;
            return (
              <div className="period-detail" key={period.id}>
                <h3>
                  {period.label}
                  <small>
                    {period.start} ~ {period.end}
                  </small>
                </h3>
                <div className="period-detail-grid">
                  <div>
                    <span>판매수량</span>
                    <strong>{fmt(row.qty)}개</strong>
                    <small>
                      지점 판매량의 {fmtPct((row.qtyShare ?? 0) * 100)}
                    </small>
                  </div>
                  <div>
                    <span>판매금액</span>
                    <strong>{fmtWon(row.sales)}</strong>
                    <small>
                      지점 매출의 {fmtPct((row.salesShare ?? 0) * 100)}
                    </small>
                  </div>
                  <div>
                    <span>순이익</span>
                    <strong>{fmtWon(row.profit)}</strong>
                    <small>이익률 {fmtPct(row.marginPct)}</small>
                  </div>
                  {period.days !== 30 && (
                    <div>
                      <span>월(30일) 환산</span>
                      <strong>{fmtWon(row.sales30)}</strong>
                      <small>
                        수량 {fmt(row.qty30)}개 · 순이익 {fmtWon(row.profit30)}
                      </small>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div className="score-lock">
            <b>POS 실판매 기준</b>
            <p>{data.sourceNote}</p>
          </div>
        </div>
      </aside>
    </div>
  );
}

function SalesDashboard({ data }: { data: PharmacySales }) {
  const defaultPeriod =
    data.periods.find((item) => item.id === "2026-06") ?? data.periods[0];
  const [periodId, setPeriodId] = useState(defaultPeriod.id);
  const [sort, setSort] = useState<SortState>({ key: null, dir: "desc" });
  const [group, setGroup] = useState("전체");
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const period: SalesPeriod =
    data.periods.find((item) => item.id === periodId) ?? data.periods[0];

  const cycleSort = (key: SortKey) =>
    setSort((prev) =>
      prev.key !== key
        ? { key, dir: "desc" }
        : prev.dir === "desc"
          ? { key, dir: "asc" }
          : { key: null, dir: "desc" },
    );

  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of period.rows) {
      const key = productGroup(data, row.name);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [data, period]);

  const rows = useMemo(() => {
    const filtered = period.rows.filter(
      (row) => group === "전체" || productGroup(data, row.name) === group,
    );
    if (!sort.key) return filtered; // 기본: POS 순위 순서 복원
    const direction = sort.dir === "desc" ? -1 : 1;
    const key = sort.key;
    return [...filtered].sort(
      (a, b) => (((a[key] ?? 0) as number) - ((b[key] ?? 0) as number)) * direction,
    );
  }, [data, period, sort, group]);

  const beautyShare = useMemo(() => {
    const total = period.rows.reduce((sum, row) => sum + (row.sales ?? 0), 0);
    if (!total) return null;
    const beauty = period.rows
      .filter((row) => productGroup(data, row.name) === "화장품")
      .reduce((sum, row) => sum + (row.sales ?? 0), 0);
    return (beauty / total) * 100;
  }, [data, period]);

  const maxQtyShare = Math.max(
    ...period.rows.map((row) => row.qtyShare ?? 0),
    0.0001,
  );
  const maxSalesShare = Math.max(
    ...period.rows.map((row) => row.salesShare ?? 0),
    0.0001,
  );

  return (
    <>
      <section className="metrics pharmacy-metrics reveal">
        <Metric
          label="기간 판매금액"
          value={period.totals.sales}
          format={fmtWonBare}
          suffix="원"
          caption={
            period.days !== 30
              ? `월 환산 ${fmtWon(period.totals.sales30)}원`
              : `등록 품목 ${fmt(period.posItemCount)}개 합계`
          }
        />
        <Metric
          label="기간 순이익"
          value={period.totals.profit}
          format={fmtWonBare}
          suffix="원"
          caption={`평균 이익률 ${fmtPct(period.totals.marginPct, 2)}`}
        />
        <Metric
          label="기간 판매수량"
          value={period.totals.qty}
          format={fmt}
          suffix="개"
          caption={`판매 품목 ${fmt(period.posItemCount)}종`}
        />
        <Metric
          label="뷰티(화장품) 매출 비중"
          value={beautyShare}
          format={(value) => value.toFixed(1)}
          suffix="%"
          caption="상위 품목 기준"
        />
        <Metric
          label="누적 판매 건수"
          value={data.ledger.transactionCount}
          format={fmt}
          suffix="건"
          caption={`판매내역 ${data.ledger.start} ~ ${data.ledger.end}`}
        />
      </section>
      <section className="panel ranking-panel reveal">
        <div className="section-head">
          <div>
            <p className="section-kicker">POS 실판매 순위</p>
            <h2>제품별 판매 실적</h2>
          </div>
          <div className="period-toggle" role="tablist" aria-label="집계 기간">
            {data.periods.map((item) => (
              <button
                key={item.id}
                role="tab"
                aria-selected={item.id === period.id}
                className={item.id === period.id ? "active" : ""}
                onClick={() => setPeriodId(item.id)}
              >
                {item.label.replace("2026년 ", "")}
              </button>
            ))}
          </div>
        </div>
        <div className="sales-controls">
          <div className="chip-row secondary" role="tablist" aria-label="카테고리">
            <button
              className={group === "전체" ? "active" : ""}
              onClick={() => setGroup("전체")}
            >
              전체 {period.rows.length}
            </button>
            {groups.map(([name, count]) => (
              <button
                key={name}
                className={group === name ? "active" : ""}
                onClick={() => setGroup(name)}
              >
                {name} {count}
              </button>
            ))}
          </div>
          <span className="sort-hint">
            열 제목을 누르면 내림차순·오름차순·기본 순으로 바뀝니다
          </span>
        </div>
        <div className="table-wrap">
          <table className="sales-table">
            <thead>
              <tr>
                <th>순위</th>
                <th>제품</th>
                {sortColumns.map((column) => (
                  <th key={column.key}>
                    <button
                      className={`th-sort ${sort.key === column.key ? sort.dir : ""}`}
                      onClick={() => cycleSort(column.key)}
                      aria-label={`${column.label} 정렬`}
                    >
                      {column.label}
                      <i>
                        {sort.key !== column.key
                          ? "⇅"
                          : sort.dir === "desc"
                            ? "▼"
                            : "▲"}
                      </i>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row: SalesRow, index) => {
                const rowGroup = productGroup(data, row.name);
                return (
                  <tr
                    key={`${period.id}-${row.name}`}
                    onClick={() => setSelectedProduct(row.name)}
                    tabIndex={0}
                    onKeyDown={(event) =>
                      event.key === "Enter" && setSelectedProduct(row.name)
                    }
                  >
                    <td>
                      <span className="rank">
                        {sort.key ? index + 1 : row.rank}
                      </span>
                    </td>
                    <td>
                      <strong>
                        {row.name}{" "}
                        <span
                          className={`cat-badge ${groupTone[rowGroup] ?? "etc"}`}
                        >
                          {rowGroup}
                        </span>
                      </strong>
                      <small>
                        {row.maker}
                        {data.products[row.name]?.use
                          ? ` · ${data.products[row.name].use}`
                          : ""}
                      </small>
                    </td>
                    <td>
                      <div className="demand-score">
                        <strong>{fmt(row.qty)}</strong>
                        <div className="signal">
                          <span
                            style={{
                              width: `${((row.qtyShare ?? 0) / maxQtyShare) * 100}%`,
                            }}
                          />
                        </div>
                        <small>비중 {fmtPct((row.qtyShare ?? 0) * 100)}</small>
                      </div>
                    </td>
                    <td>
                      <div className="demand-score">
                        <strong>{fmtWon(row.sales)}</strong>
                        <div className="signal">
                          <span
                            style={{
                              width: `${((row.salesShare ?? 0) / maxSalesShare) * 100}%`,
                            }}
                          />
                        </div>
                        <small>
                          {period.days !== 30
                            ? `월 환산 ${fmtWon(row.sales30)}`
                            : `비중 ${fmtPct((row.salesShare ?? 0) * 100)}`}
                        </small>
                      </div>
                    </td>
                    <td>
                      <strong className="profit-cell">
                        {fmtWon(row.profit)}
                      </strong>
                    </td>
                    <td>
                      <span
                        className={`margin-badge ${
                          (row.marginPct ?? 0) >= 45
                            ? "high"
                            : (row.marginPct ?? 0) >= 30
                              ? "mid"
                              : "low"
                        }`}
                      >
                        {fmtPct(row.marginPct)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="quality-note">
          {data.sourceNote} 합계 카드는 기간 전체 {fmt(period.posItemCount)}개
          품목, 표는 상위 노출 품목 기준으로 기간 매출의{" "}
          {fmtPct(period.rowSalesCoveragePct)}를 담았습니다.
        </p>
      </section>
      {selectedProduct && (
        <ProductSalesDrawer
          data={data}
          name={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </>
  );
}

export default function PharmacyView() {
  const [pharmacy, setPharmacy] = useState<Pharmacy>(pharmacies[0]);
  // 복호화 결과는 React 상태에만 둔다 — 새로고침하면 다시 잠긴다.
  const [bundle, setBundle] = useState<PharmacyDataFile | null>(null);
  const data = bundle?.pharmacies[pharmacy.id] ?? null;
  useRevealOnScroll([pharmacy, bundle]);

  return (
    <>
      <section className="hero pharmacy-hero">
        <div>
          <p className="eyebrow">POS 실판매 집계</p>
          <h1>
            뷰티 약국 <span className="grad">실매출 데이터</span>
          </h1>
          <p className="hero-copy">
            성수·명동 파트너 약국의 POS 판매 기록을
            <br className="desktop" /> 제품별·기간별로 집계했습니다.
          </p>
        </div>
      </section>
      <section className="pharmacy-toolbar">
        <PharmacyPicker
          selected={pharmacy}
          onSelect={(next) => setPharmacy(next)}
        />
        {data && (
          <div className="unlock-state">
            <span className="live-dot" />
            열람 인증됨 · {data.pharmacyName}
          </div>
        )}
      </section>
      {data ? (
        <SalesDashboard key={pharmacy.id} data={data} />
      ) : (
        <SalesGate onUnlock={(decrypted) => setBundle(decrypted)} />
      )}
    </>
  );
}
