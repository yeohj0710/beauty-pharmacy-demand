"use client";

import { useEffect, useMemo, useState } from "react";
import {
  decryptPharmacySales,
  pharmacies,
  type Pharmacy,
  type PharmacySales,
  type SalesPeriod,
  type SalesRow,
} from "./pharmacy-data";

const GATE_STORAGE_KEY = "pharmacy-sales-gate";

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

type SortKey = "qty" | "sales" | "profit" | "marginPct";
const sortOptions: { id: SortKey; label: string }[] = [
  { id: "qty", label: "판매수량순" },
  { id: "sales", label: "판매금액순" },
  { id: "profit", label: "순이익순" },
  { id: "marginPct", label: "이익률순" },
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
                  <span
                    className={`branch-badge ${
                      pharmacy.status === "live" ? "live" : "restricted"
                    }`}
                  >
                    {pharmacy.status === "live" ? "실매출 연동" : "열람 제한"}
                  </span>
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
  onUnlock: (data: PharmacySales, password: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [phase, setPhase] = useState<"idle" | "busy" | "error">("idle");
  const submit = async () => {
    if (!password || phase === "busy") return;
    setPhase("busy");
    try {
      const data = await decryptPharmacySales(password);
      sessionStorage.setItem(GATE_STORAGE_KEY, password);
      onUnlock(data, password);
    } catch {
      setPhase("error");
    }
  };
  return (
    <section className="panel gate-panel" aria-label="실매출 데이터 열람 보호">
      <span className="gate-lock" aria-hidden>
        🔒
      </span>
      <h2>실매출 데이터 열람 보호</h2>
      <p>
        파트너 약국의 POS 영업 데이터입니다. 지점 매출 데이터는 열람 암호를
        확인한 뒤에만 복호화되어 표시됩니다.
      </p>
      <div className="gate-form">
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          placeholder="열람 암호"
          aria-label="열람 암호"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            if (phase === "error") setPhase("idle");
          }}
          onKeyDown={(event) => event.key === "Enter" && submit()}
        />
        <button className="primary" onClick={submit} disabled={phase === "busy"}>
          {phase === "busy" ? "확인 중…" : "데이터 열람"}
        </button>
      </div>
      {phase === "error" && (
        <p className="gate-error">열람 암호가 올바르지 않습니다.</p>
      )}
      <small>
        데이터는 표준 암호화(AES-256-GCM)로 보관되며 암호 없이 열 수 없습니다.
      </small>
    </section>
  );
}

function RestrictedBranch({ pharmacy }: { pharmacy: Pharmacy }) {
  return (
    <section className="panel gate-panel" aria-label="지점 열람 제한">
      <span className="gate-lock" aria-hidden>
        🔒
      </span>
      <h2>{pharmacy.name} · 열람 권한 필요</h2>
      <p>
        지점별 매출 데이터 열람 권한은 파트너 계약 범위에 따라 지점 단위로
        발급됩니다. 현재 세션에서 열람할 수 있는 지점은{" "}
        <b>퓨어약국 성수점</b>입니다.
      </p>
      <div className="branch-meta">
        <div>
          <span>상권</span>
          <strong>{pharmacy.area}</strong>
        </div>
        <div>
          <span>지점 특성</span>
          <strong>{pharmacy.tags.join(" · ")}</strong>
        </div>
        <div>
          <span>열람 상태</span>
          <strong>권한 미발급</strong>
        </div>
      </div>
      <small>지점 열람 권한은 웰니스박스 파트너십 채널로 문의해 주세요.</small>
    </section>
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
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer product-drawer"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${name} 판매 상세`}
      >
        <button className="close" onClick={onClose} aria-label="닫기">
          ×
        </button>
        <span className="drawer-rank">제품 판매 상세</span>
        <h2>
          {name}{" "}
          <span className={`cat-badge ${groupTone[group] ?? "etc"}`}>{group}</span>
        </h2>
        {info && (
          <div className="entity-rule">
            <b>제조·브랜드</b>
            <p>{info.brand || "—"}</p>
            <b>주요 성분·특징</b>
            <p>{info.feature || "—"}</p>
            <b>용도</b>
            <p>{info.use || "—"}</p>
          </div>
        )}
        <div className="drawer-scroll">
          {data.periods.map((period) => {
            const row = period.rows.find((item) => item.name === name);
            if (!row) return null;
            return (
              <div className="period-detail" key={period.id}>
                <h3 className="drawer-heading">
                  {period.label}
                  <small>
                    {period.start} ~ {period.end}
                  </small>
                </h3>
                <div className="period-detail-grid">
                  <div>
                    <span>판매수량</span>
                    <strong>{fmt(row.qty)}개</strong>
                    <small>지점 판매량의 {fmtPct((row.qtyShare ?? 0) * 100)}</small>
                  </div>
                  <div>
                    <span>판매금액</span>
                    <strong>{fmtWon(row.sales)}</strong>
                    <small>지점 매출의 {fmtPct((row.salesShare ?? 0) * 100)}</small>
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
                      <small>수량 {fmt(row.qty30)}개 · 순이익 {fmtWon(row.profit30)}</small>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div className="score-lock">
            <b>POS 실판매 기준</b>
            <p>
              {data.sourceNote}. 순위·비율은 해당 기간 지점 POS 상품통계 화면
              수치를 그대로 기록한 값입니다.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}

function SalesDashboard({ data }: { data: PharmacySales }) {
  const [periodId, setPeriodId] = useState(data.periods[0]?.id);
  const [sortKey, setSortKey] = useState<SortKey>("sales");
  const [group, setGroup] = useState("전체");
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const period: SalesPeriod =
    data.periods.find((item) => item.id === periodId) ?? data.periods[0];

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
    return filtered.sort(
      (a, b) => ((b[sortKey] ?? 0) as number) - ((a[sortKey] ?? 0) as number),
    );
  }, [data, period, sortKey, group]);

  const beautyShare = useMemo(() => {
    const total = period.rows.reduce((sum, row) => sum + (row.sales ?? 0), 0);
    if (!total) return null;
    const beauty = period.rows
      .filter((row) => productGroup(data, row.name) === "화장품")
      .reduce((sum, row) => sum + (row.sales ?? 0), 0);
    return (beauty / total) * 100;
  }, [data, period]);

  const maxQtyShare = Math.max(...period.rows.map((row) => row.qtyShare ?? 0), 0.0001);
  const maxSalesShare = Math.max(...period.rows.map((row) => row.salesShare ?? 0), 0.0001);

  return (
    <>
      <section className="metrics pharmacy-metrics">
        <article>
          <p>기간 판매금액</p>
          <strong>
            {fmtWon(period.totals.sales)}
            <small>원</small>
          </strong>
          <span>
            {period.days !== 30
              ? `월 환산 ${fmtWon(period.totals.sales30)}원`
              : `POS 등록 ${fmt(period.posItemCount)}개 품목 합계`}
          </span>
        </article>
        <article>
          <p>기간 순이익</p>
          <strong>
            {fmtWon(period.totals.profit)}
            <small>원</small>
          </strong>
          <span>평균 이익률 {fmtPct(period.totals.marginPct, 2)}</span>
        </article>
        <article>
          <p>기간 판매수량</p>
          <strong>
            {fmt(period.totals.qty)}
            <small>개</small>
          </strong>
          <span>판매 상품 {fmt(period.posItemCount)}종</span>
        </article>
        <article>
          <p>뷰티(화장품) 매출 비중</p>
          <strong>
            {beautyShare == null ? "—" : beautyShare.toFixed(1)}
            <small>%</small>
          </strong>
          <span>데이터화 상위 상품 기준</span>
        </article>
        <article>
          <p>누적 판매 건수</p>
          <strong>
            {fmt(data.ledger.transactionCount)}
            <small>건</small>
          </strong>
          <span>
            판매내역 {data.ledger.start} ~ {data.ledger.end}
          </span>
        </article>
      </section>
      <section className="panel ranking-panel">
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
                {item.label}
                <small>{item.days}일</small>
              </button>
            ))}
          </div>
        </div>
        <div className="sales-controls">
          <div className="chip-row" role="tablist" aria-label="정렬 기준">
            {sortOptions.map((option) => (
              <button
                key={option.id}
                className={sortKey === option.id ? "active" : ""}
                onClick={() => setSortKey(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
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
        </div>
        <div className="table-wrap">
          <table className="sales-table">
            <thead>
              <tr>
                <th>순위</th>
                <th>제품</th>
                <th>판매수량</th>
                <th>판매금액</th>
                <th>순이익</th>
                <th>이익률</th>
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
                      <span className="rank">{index + 1}</span>
                    </td>
                    <td>
                      <strong>
                        {row.name}{" "}
                        <span className={`cat-badge ${groupTone[rowGroup] ?? "etc"}`}>
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
                      <strong className="profit-cell">{fmtWon(row.profit)}</strong>
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
          {data.sourceNote}. 표의 순위·비율은 지점 POS 상품통계 수치를 그대로
          사용하며, 상단 합계 카드는 기간 전체({fmt(period.posItemCount)}개 품목)
          기준입니다. 상품 행은 POS 상위 노출 품목을 데이터화한 것으로 기간
          매출의 {fmtPct(period.rowSalesCoveragePct)}를 커버합니다.
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
  const [data, setData] = useState<PharmacySales | null>(null);
  const [checkedStorage, setCheckedStorage] = useState(false);

  useEffect(() => {
    // 같은 탭에서 새로고침해도 다시 묻지 않도록 세션 저장 암호로 자동 해제
    const stored = sessionStorage.getItem(GATE_STORAGE_KEY);
    const attempt = stored
      ? decryptPharmacySales(stored).then(
          (decrypted) => setData(decrypted),
          () => sessionStorage.removeItem(GATE_STORAGE_KEY),
        )
      : Promise.resolve();
    attempt.finally(() => setCheckedStorage(true));
  }, []);

  return (
    <>
      <section className="hero pharmacy-hero">
        <div>
          <p className="eyebrow">BEAUTY PHARMACY SALES</p>
          <h1>
            뷰티 약국 실매출을
            <br />
            지점 단위로 확인하세요
          </h1>
          <p className="hero-copy">
            성수·명동 뷰티 상권 파트너 약국의 POS 판매 데이터를
            <br className="desktop" /> 제품·기간 단위로 집계해 실제 팔리는
            제품을 보여줍니다.
          </p>
        </div>
        <div className="hero-status">
          <span className="live-dot" />
          파트너 지점
          <strong>{pharmacies.length}개 지점 · 실매출 연동 1</strong>
        </div>
      </section>
      <section className="pharmacy-toolbar">
        <PharmacyPicker selected={pharmacy} onSelect={setPharmacy} />
        {pharmacy.status === "live" && data && (
          <div className="unlock-state">
            <span className="live-dot" />
            열람 인증됨 · {data.pharmacyName}
          </div>
        )}
      </section>
      {pharmacy.status === "restricted" ? (
        <RestrictedBranch pharmacy={pharmacy} />
      ) : data ? (
        <SalesDashboard data={data} />
      ) : checkedStorage ? (
        <SalesGate onUnlock={(decrypted) => setData(decrypted)} />
      ) : null}
    </>
  );
}
