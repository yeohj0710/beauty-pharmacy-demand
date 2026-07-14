"use client";

import { useMemo, useState } from "react";
import salesData from "./sales-data.json";

type Product = (typeof salesData)[number];
type View = "overview" | "products" | "sources" | "method";

const money = (value: number) => `${Math.round(value / 10000).toLocaleString("ko-KR")}만원`;
const number = (value: number) => value.toLocaleString("ko-KR");

const nav: { id: View; label: string }[] = [
  { id: "overview", label: "수요 개요" },
  { id: "products", label: "제품 분석" },
  { id: "sources", label: "데이터 소스" },
  { id: "method", label: "산정 기준" },
];

function Signal({ value, tone = "blue" }: { value: number; tone?: "blue" | "green" | "orange" }) {
  return (
    <div className={`signal ${tone}`} aria-label={`${value}점`}>
      <span style={{ width: `${value}%` }} />
    </div>
  );
}

function Overview({ onSelect }: { onSelect: (p: Product) => void }) {
  const top = salesData.slice(0, 8);
  const totalRevenue = salesData.reduce((sum, p) => sum + p.revenue, 0);
  const totalProfit = salesData.reduce((sum, p) => sum + p.profit, 0);
  const aligned = salesData.filter((p) => Math.abs(p.gap) <= 10).length;

  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">PURE PHARMACY · DEMAND INTELLIGENCE</p>
          <h1>팔린 만큼,<br />왜 팔렸는지 봅니다</h1>
          <p className="hero-copy">실제 약국 판매를 기준으로 온라인 관심 신호를 비교해<br className="desktop" /> 다음에 키울 제품을 빠르게 찾으세요.</p>
        </div>
        <div className="hero-status">
          <span className="live-dot" /> 실판매 데이터 연결됨
          <strong>2026. 06. 01 — 06. 30</strong>
        </div>
      </section>

      <section className="metrics" aria-label="핵심 지표">
        <article><p>분석 제품</p><strong>{salesData.length}<small>개</small></strong><span>성수 퓨어약국 판매 제품</span></article>
        <article><p>30일 환산 매출</p><strong>{money(totalRevenue)}</strong><span>분석 제품 합계</span></article>
        <article><p>30일 환산 순이익</p><strong>{money(totalProfit)}</strong><span>실판매 기준</span></article>
        <article><p>신호 일치 제품</p><strong>{aligned}<small>개</small></strong><span>점수 차이 ±10 이내</span></article>
      </section>

      <section className="panel ranking-panel">
        <div className="section-head">
          <div><p className="section-kicker">실판매 기준</p><h2>지금 가장 강한 제품</h2></div>
          <span className="sample-badge">온라인 점수는 검증용 샘플</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>순위</th><th>제품</th><th>판매 수요</th><th>온라인 신호</th><th>30일 매출</th><th>판단</th></tr></thead>
            <tbody>
              {top.map((p, i) => (
                <tr key={p.name} onClick={() => onSelect(p)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onSelect(p)}>
                  <td><span className="rank">{i + 1}</span></td>
                  <td><strong>{p.name}</strong><small>{p.maker}</small></td>
                  <td><div className="score-label"><b>{p.salesScore}</b><span> / 100</span></div><Signal value={p.salesScore} /></td>
                  <td><div className="score-label"><b>{p.onlineScore}</b><span> / 100</span></div><Signal value={p.onlineScore} tone="green" /></td>
                  <td><strong>{money(p.revenue)}</strong><small>{number(p.units)}개 판매</small></td>
                  <td><span className={`verdict ${p.gap > 10 ? "hot" : p.gap < -10 ? "quiet" : "fit"}`}>{p.gap > 10 ? "관심 선행" : p.gap < -10 ? "판매 우세" : "신호 일치"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="insight-grid">
        <article className="panel insight-main"><p className="section-kicker">이번 달 발견</p><h2>온라인보다 매출이 먼저<br />움직인 제품이 있어요</h2><p>실판매 점수가 온라인 신호보다 10점 이상 높은 제품입니다. 입소문 데이터가 따라오기 전에 재고와 유통을 먼저 검토할 수 있어요.</p><div className="chips">{salesData.filter(p => p.gap < -10).slice(0, 3).map(p => <button key={p.name} onClick={() => onSelect(p)}>{p.name}<b>{p.gap}점</b></button>)}</div></article>
        <article className="panel data-trust"><p className="section-kicker">데이터 신뢰도</p><div className="trust-score"><strong>78</strong><span>/ 100</span></div><p>실판매 데이터는 확인됨. 온라인 신호는 수집기 연결 전 샘플 상태입니다.</p><ul><li className="done">판매·매출·순이익 <b>연결 완료</b></li><li className="ready">네이버·구글 <b>연결 준비</b></li><li>유튜브·인스타·틱톡 <b>수집 검증 필요</b></li></ul></article>
      </section>
    </>
  );
}

function Products({ onSelect }: { onSelect: (p: Product) => void }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("revenue");
  const rows = useMemo(() => salesData.filter(p => p.name.includes(query) || p.maker.includes(query)).sort((a,b) => sort === "units" ? b.units-a.units : sort === "margin" ? b.margin-a.margin : b.revenue-a.revenue), [query, sort]);
  return <section className="page-section"><div className="page-title"><p className="section-kicker">50개 제품</p><h1>제품 분석</h1><p>30일 실판매 실적과 온라인 신호의 차이를 제품별로 확인하세요.</p></div><div className="toolbar"><label className="search"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="제품명 또는 제조사 검색" /></label><select value={sort} onChange={e=>setSort(e.target.value)}><option value="revenue">매출 높은 순</option><option value="units">판매량 높은 순</option><option value="margin">이익률 높은 순</option></select></div><div className="product-grid">{rows.map(p=><button className="product-card" key={p.name} onClick={()=>onSelect(p)}><div className="card-top"><span className="rank">{p.rank}</span><span className={`verdict ${p.gap > 10 ? "hot" : p.gap < -10 ? "quiet" : "fit"}`}>{p.gap > 10 ? "관심 선행" : p.gap < -10 ? "판매 우세" : "신호 일치"}</span></div><h3>{p.name}</h3><p>{p.maker}</p><div className="card-numbers"><span>매출<strong>{money(p.revenue)}</strong></span><span>판매<strong>{number(p.units)}개</strong></span><span>이익률<strong>{p.margin}%</strong></span></div><div className="compare"><div><span>판매 수요 {p.salesScore}</span><Signal value={p.salesScore}/></div><div><span>온라인 신호 {p.onlineScore}</span><Signal value={p.onlineScore} tone="green"/></div></div></button>)}</div></section>;
}

function Sources() {
  const sources = [
    ["실판매", "성수 퓨어약국", "연결됨", "판매수량 · 매출 · 순이익 · 이익률", "live"],
    ["검색", "네이버 데이터랩", "연결 준비", "검색량 · 성별/연령 · 기간 추세", "ready"],
    ["검색", "Google Trends", "연결 준비", "상대 관심도 · 지역 · 연관 검색어", "ready"],
    ["소셜", "YouTube", "검증 필요", "콘텐츠 수 · 조회 · 좋아요 · 댓글", "todo"],
    ["소셜", "Instagram", "수작업 기준", "릴스 수 · 조회 · 반응 · 광고 구분", "todo"],
    ["소셜", "TikTok", "검증 필요", "영상 수 · 조회 · 좋아요 · 공유", "todo"],
  ];
  return <section className="page-section"><div className="page-title"><p className="section-kicker">COLLECT → NORMALIZE → VALIDATE</p><h1>데이터 소스</h1><p>수집량보다 “판매와 얼마나 맞는가”를 기준으로 소스를 남깁니다.</p></div><div className="source-list">{sources.map(s=><article key={s[1]}><span className="source-type">{s[0]}</span><div><h3>{s[1]}</h3><p>{s[3]}</p></div><span className={`source-status ${s[4]}`}>{s[2]}</span></article>)}</div><div className="panel next-step"><p className="section-kicker">권장 연결 순서</p><div className="step-flow"><span><b>1</b>네이버·구글</span><i>→</i><span><b>2</b>유튜브</span><i>→</i><span><b>3</b>인스타·틱톡</span><i>→</i><span><b>4</b>실판매 상관 검증</span></div></div></section>;
}

function Method() {
  return <section className="page-section method"><div className="page-title"><p className="section-kicker">점수보다 근거가 먼저</p><h1>수요 산정 기준</h1><p>원점수를 숨기지 않고, 플랫폼별 가중치와 검증 상태를 분리합니다.</p></div><div className="formula"><span>실판매 수요</span><b>65%</b><i>+</i><span>온라인 관심</span><b>35%</b><i>=</i><strong>검증 수요 점수</strong></div><div className="method-grid"><article><span>01</span><h3>제품명 정규화</h3><p>SKU를 브랜드·시리즈·용량으로 나누고 대표 검색 키워드를 지정합니다.</p></article><article><span>02</span><h3>플랫폼별 원점수</h3><p>조회수 100만을 모두 같게 보지 않고 플랫폼별 분포 안에서 환산합니다.</p></article><article><span>03</span><h3>이상치 제어</h3><p>상위 게시물 하나가 전체를 왜곡하지 않도록 중앙값과 상위 N개를 함께 봅니다.</p></article><article><span>04</span><h3>실판매 검증</h3><p>온라인 순위와 30일 환산 판매 순위의 상관을 확인해 가중치를 조정합니다.</p></article></div><div className="caution"><strong>현재 버전의 해석</strong><p>판매 데이터는 실제 성수 퓨어약국 자료입니다. 온라인 점수는 수집 파이프라인을 붙이기 전 화면과 비교 로직을 검증하기 위한 샘플이며, 의사결정 근거로 사용하면 안 됩니다.</p></div></section>;
}

function Detail({ product, onClose }: { product: Product; onClose: () => void }) {
  const platformNames: Record<string,string> = { youtube:"YouTube", instagram:"Instagram", tiktok:"TikTok", naver:"네이버", google:"Google" };
  const growth = product.previousRevenue ? Math.round((product.revenue / product.previousRevenue - 1) * 100) : 0;
  return <div className="drawer-backdrop" onClick={onClose}><aside className="drawer" onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${product.name} 상세`}><button className="close" onClick={onClose}>×</button><span className="drawer-rank">실판매 {product.rank}위</span><h2>{product.name}</h2><p>{product.maker}</p><div className="drawer-stats"><div><span>30일 매출</span><strong>{money(product.revenue)}</strong><small className={growth>=0?"up":"down"}>90일 월평균 대비 {growth>=0?"+":""}{growth}%</small></div><div><span>판매량</span><strong>{number(product.units)}개</strong><small>일평균 {(product.units/30).toFixed(1)}개</small></div><div><span>순이익</span><strong>{money(product.profit)}</strong><small>이익률 {product.margin}%</small></div></div><div className="drawer-section"><h3>수요 신호 비교</h3><div className="big-compare"><div><span>실판매</span><strong>{product.salesScore}</strong><Signal value={product.salesScore}/></div><div><span>온라인 샘플</span><strong>{product.onlineScore}</strong><Signal value={product.onlineScore} tone="green"/></div></div></div><div className="drawer-section"><h3>플랫폼별 샘플 신호</h3>{Object.entries(product.platforms).map(([k,v])=><div className="platform-row" key={k}><span>{platformNames[k]}</span><Signal value={v}/><b>{v}</b></div>)}</div><div className="drawer-note"><b>{product.gap > 10 ? "온라인 관심이 판매보다 앞섭니다." : product.gap < -10 ? "판매가 온라인 관심보다 강합니다." : "온라인 신호와 판매가 비슷합니다."}</b><p>{product.gap < -10 ? "검색 키워드 누락이나 오프라인 특화 수요인지 확인하세요." : "실제 온라인 수집 연결 후 점수 차이를 다시 검증하세요."}</p></div></aside></div>;
}

export default function Home() {
  const [view, setView] = useState<View>("overview");
  const [selected, setSelected] = useState<Product | null>(null);
  return <div className="app-shell"><aside className="sidebar"><div className="brand" onClick={()=>setView("overview")}><span>W</span><div>웰니스박스<small>Demand Radar</small></div></div><nav>{nav.map(n=><button key={n.id} className={view===n.id?"active":""} onClick={()=>setView(n.id)}><i>{n.id==="overview"?"⌁":n.id==="products"?"▦":n.id==="sources"?"◉":"◇"}</i>{n.label}</button>)}</nav><div className="sidebar-foot"><span className="live-dot"/>성수 퓨어약국<small>마지막 동기화 7월 9일</small></div></aside><main>{view==="overview"&&<Overview onSelect={setSelected}/>} {view==="products"&&<Products onSelect={setSelected}/>} {view==="sources"&&<Sources/>} {view==="method"&&<Method/>}</main>{selected&&<Detail product={selected} onClose={()=>setSelected(null)}/>}</div>;
}
