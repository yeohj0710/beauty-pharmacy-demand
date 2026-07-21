// 대외비 스타일 암호화 XLSX 보고서 생성.
// 현재 대시보드 세팅(가중치·프리셋·직접 입력)이 반영된 순위 스냅샷을
// Excel 표준 암호화(열 때 암호 요구, ECMA-376 Agile)로 내보낸다.
import signalFile from "./signals.json";
import qualityFile from "./signal-quality.json";

type AnyRec = Record<string, any>;

export type ReportRow = {
  rank: number;
  name: string;
  score: number;
  coverage: number;
  keywords: string[];
  skuNames: string[];
  channelScores: Record<string, number | null>;
};

export type ReportInput = {
  password: string;
  presetName: string;
  weights: Record<string, number>;
  rows: ReportRow[];
  manualCount: number;
};

const PLATFORMS: { id: string; name: string }[] = [
  { id: "naver", name: "네이버" },
  { id: "google", name: "Google" },
  { id: "youtube", name: "YouTube" },
  { id: "instagram", name: "Instagram" },
  { id: "tiktok", name: "TikTok" },
];

const INK = "1b2430";
const PAPER = "f7f5f0";
const RED = "c92a2a";
const VERDICT_STYLE: AnyRec = {
  usable: { label: "판단 가능", fill: "e6fcf5", color: "087f5b" },
  caution: { label: "주의", fill: "fff4e6", color: "b35c00" },
  insufficient: { label: "표본 부족", fill: "fff0f0", color: "c92a2a" },
};
const CONFIDENCE_LABEL: AnyRec = {
  high: "높음",
  medium: "중간",
  low: "낮음",
  none: "없음",
};

const qualityProducts = (qualityFile as AnyRec).products as AnyRec;
const qualityMeta = (qualityFile as AnyRec).meta as AnyRec;

const scoreBar = (score: number) => {
  const filled = Math.round(Math.max(0, Math.min(100, score)) / 10);
  return "█".repeat(filled) + "░".repeat(10 - filled);
};

const pct = (value: number | null | undefined) =>
  value == null ? "—" : `${Math.round(value * 100)}%`;

const stamp = (workbookDate: Date) =>
  `${workbookDate.getFullYear()}-${String(workbookDate.getMonth() + 1).padStart(2, "0")}-${String(workbookDate.getDate()).padStart(2, "0")} ${String(workbookDate.getHours()).padStart(2, "0")}:${String(workbookDate.getMinutes()).padStart(2, "0")}`;

// 시트 상단 공통 등급 배너
const banner = (sheet: AnyRec, lastColumn: string, title: string) => {
  sheet.range(`A1:${lastColumn}1`).merged(true).value(
    "대외비 · CONFIDENTIAL — 내부 조사용 · 무단 복제·배포 금지",
  ).style({
    fill: INK,
    fontColor: "ffffff",
    bold: true,
    fontSize: 10,
    fontFamily: "Consolas",
    horizontalAlignment: "center",
    verticalAlignment: "center",
  });
  sheet.row(1).height(24);
  sheet.range(`A2:${lastColumn}2`).merged(true).value(title).style({
    bold: true,
    fontSize: 14,
    fontColor: INK,
    verticalAlignment: "center",
  });
  sheet.row(2).height(26);
};

const headerRow = (
  sheet: AnyRec,
  rowIndex: number,
  labels: string[],
) => {
  labels.forEach((label, index) => {
    sheet.cell(rowIndex, index + 1).value(label).style({
      fill: INK,
      fontColor: "ffffff",
      bold: true,
      fontSize: 10,
      horizontalAlignment: "center",
      verticalAlignment: "center",
      wrapText: true,
    });
  });
  sheet.row(rowIndex).height(30);
};

const buildCover = (sheet: AnyRec, input: ReportInput, now: Date) => {
  sheet.name("표지");
  sheet.gridLinesVisible(false);
  for (let row = 1; row <= 40; row += 1) {
    sheet.range(`A${row}:J${row}`).style({ fill: PAPER });
  }
  sheet.range("A1:J2").merged(true).style({ fill: INK });
  sheet.range("A39:J40").merged(true).style({ fill: INK });
  sheet.column("A").width(3);
  for (const col of ["B", "C", "D", "E", "F", "G", "H", "I"]) {
    sheet.column(col).width(13);
  }

  // 대외비 스탬프
  sheet.range("G4:I6").merged(true).value("대  외  비").style({
    bold: true,
    fontSize: 22,
    fontColor: RED,
    horizontalAlignment: "center",
    verticalAlignment: "center",
    border: { style: "thick", color: RED },
  });

  sheet.range("B9:I9").merged(true).value("제품 온라인 수요 조사 보고서").style({
    bold: true,
    fontSize: 26,
    fontColor: INK,
  });
  sheet.range("B11:I11").merged(true)
    .value("WELLNESSBOX PRODUCT DEMAND RESEARCH — INTERNAL USE ONLY")
    .style({ fontSize: 11, fontColor: "6b7684", fontFamily: "Consolas" });

  const verdictCounts = qualityMeta?.verdicts ?? {};
  const weightText = PLATFORMS.map(
    (platform) => `${platform.name} ${input.weights[platform.id] ?? 0}`,
  ).join(" · ");
  const meta: [string, string][] = [
    ["문서 생성", `${stamp(now)} (열람 암호 적용)`],
    ["데이터 수집 기준", String(signalFile.collectedAt).replace("T", " ").slice(0, 16) + " KST"],
    ["적용 세팅", `${input.presetName} — ${weightText}`],
    ["조사 제품", `${input.rows.length}개 수요 개체 · 5개 채널`],
    [
      "판정 분포",
      `판단 가능 ${verdictCounts.usable ?? 0} · 주의 ${verdictCounts.caution ?? 0} · 표본 부족 ${verdictCounts.insufficient ?? 0}`,
    ],
    ["직접 입력 반영", `${input.manualCount}건 (브라우저 저장 조사값)`],
  ];
  meta.forEach(([label, value], index) => {
    const row = 15 + index * 2;
    sheet.range(`B${row}:C${row}`).merged(true).value(label).style({
      bold: true,
      fontSize: 10,
      fontColor: "6b7684",
    });
    sheet.range(`D${row}:I${row}`).merged(true).value(value).style({
      fontSize: 11,
      fontColor: INK,
    });
  });

  sheet.range("B29:I31").merged(true).value(
    "본 문서는 공개 웹 신호 기반의 내부 조사 자료입니다. 점수는 교차 제품 분할·수집 기간 필터·상위 5개 상한 등 통계 보정을 거친 상대 지표이며, 매출·판매량 등 내부 데이터를 포함하지 않습니다. 판정 신뢰도가 '주의'·'표본 부족'인 제품은 이 순위만으로 수요를 단정할 수 없습니다.",
  ).style({
    fontSize: 10,
    fontColor: "4e5968",
    wrapText: true,
    verticalAlignment: "center",
    border: { style: "thin", color: "d5d0c5" },
  });
};

const buildRanking = (sheet: AnyRec, input: ReportInput) => {
  const labels = [
    "순위",
    "제품",
    "종합 점수",
    "SIGNAL",
    "판정",
    "근거",
    ...PLATFORMS.map((platform) => platform.name),
    "대표 검색어",
  ];
  banner(sheet, "L", `종합 순위 — ${input.presetName} 세팅 기준`);
  headerRow(sheet, 4, labels);
  sheet.column("A").width(6);
  sheet.column("B").width(36);
  sheet.column("C").width(10);
  sheet.column("D").width(14);
  sheet.column("E").width(11);
  sheet.column("F").width(7);
  ["G", "H", "I", "J", "K"].forEach((col) => sheet.column(col).width(10));
  sheet.column("L").width(30);
  sheet.freezePanes(2, 4);

  input.rows.forEach((row, index) => {
    const r = 5 + index;
    const verdict =
      VERDICT_STYLE[qualityProducts[row.name]?.verdict] ?? {
        label: "미조사",
        fill: "f2f4f6",
        color: "6b7684",
      };
    const zebra = index % 2 ? "fbfaf7" : "ffffff";
    const base = { fontSize: 10, fill: zebra, verticalAlignment: "center" };
    sheet.cell(r, 1).value(row.rank).style({ ...base, horizontalAlignment: "center", fontFamily: "Consolas" });
    sheet.cell(r, 2).value(row.name).style({ ...base, bold: true });
    sheet.cell(r, 3).value(Number(row.score.toFixed(1))).style({
      ...base,
      bold: true,
      horizontalAlignment: "center",
      numberFormat: "0.0",
    });
    sheet.cell(r, 4).value(scoreBar(row.score)).style({
      ...base,
      fontFamily: "Consolas",
      fontColor: INK,
    });
    sheet.cell(r, 5).value(verdict.label).style({
      ...base,
      fill: verdict.fill,
      fontColor: verdict.color,
      bold: true,
      horizontalAlignment: "center",
    });
    sheet.cell(r, 6).value(`${Math.round(row.coverage)}%`).style({
      ...base,
      horizontalAlignment: "center",
      fontFamily: "Consolas",
    });
    PLATFORMS.forEach((platform, platformIndex) => {
      const value = row.channelScores[platform.id];
      sheet.cell(r, 7 + platformIndex).value(value == null ? "—" : Number(value.toFixed(1))).style({
        ...base,
        horizontalAlignment: "center",
        fontFamily: "Consolas",
        fontColor: value == null ? "adb5bd" : INK,
        numberFormat: "0.0",
      });
    });
    sheet.cell(r, 12).value(row.keywords.join(" · ")).style({ ...base, fontSize: 9, fontColor: "4e5968" });
  });
};

const buildRawData = (sheet: AnyRec) => {
  banner(sheet, "N", "채널 원자료 — 원시값과 보정값 대조");
  const labels = [
    "제품",
    "채널",
    "상태",
    "표본",
    "기간 내",
    "원시 조회 합계",
    "보정 조회 합계",
    "상위5 합계",
    "중앙값/참여",
    "공유 콘텐츠",
    "공유 조회 비중",
    "기간 외 비중",
    "이상치 지배",
    "신뢰도",
  ];
  headerRow(sheet, 4, labels);
  sheet.column("A").width(34);
  sheet.column("B").width(10);
  sheet.column("C").width(14);
  ["D", "E"].forEach((col) => sheet.column(col).width(8));
  ["F", "G", "H", "I"].forEach((col) => sheet.column(col).width(14));
  ["J", "K", "L", "M", "N"].forEach((col) => sheet.column(col).width(11));
  sheet.freezePanes(1, 4);

  let r = 5;
  const numberStyle = {
    fontFamily: "Consolas",
    fontSize: 9,
    horizontalAlignment: "right",
    numberFormat: "#,##0",
  };
  for (const product of (signalFile as AnyRec).products) {
    const entry = qualityProducts[product.name] ?? {};
    for (const platform of ["youtube", "instagram", "tiktok"]) {
      const source = product[platform];
      if (!source) continue;
      const channel = entry[platform];
      const zebra = r % 2 ? "ffffff" : "fbfaf7";
      const base = { fontSize: 9, fill: zebra };
      const rawViews =
        platform === "youtube"
          ? source.totalViews ?? 0
          : source.totals?.views ?? 0;
      sheet.cell(r, 1).value(product.name).style(base);
      sheet.cell(r, 2).value(platform).style({ ...base, fontFamily: "Consolas" });
      sheet.cell(r, 3).value(source.status).style({ ...base, fontFamily: "Consolas" });
      sheet.cell(r, 4).value(channel?.sampleCount ?? 0).style({ ...base, ...numberStyle });
      sheet.cell(r, 5).value(channel?.adjustedSampleCount ?? 0).style({ ...base, ...numberStyle });
      sheet.cell(r, 6).value(rawViews).style({ ...base, ...numberStyle });
      sheet.cell(r, 7)
        .value(channel?.adjustedTotalViews ?? channel?.adjustedViews ?? 0)
        .style({ ...base, ...numberStyle });
      sheet.cell(r, 8).value(channel?.adjustedTopViews ?? 0).style({ ...base, ...numberStyle });
      sheet.cell(r, 9)
        .value(channel?.adjustedMedianViews ?? channel?.adjustedTopEngagement ?? 0)
        .style({ ...base, ...numberStyle });
      sheet.cell(r, 10).value(channel?.sharedContentCount ?? 0).style({ ...base, ...numberStyle });
      sheet.cell(r, 11).value(pct(channel?.sharedViewsShare)).style({ ...base, fontFamily: "Consolas", horizontalAlignment: "right" });
      sheet.cell(r, 12).value(pct(channel?.staleViewsShare)).style({ ...base, fontFamily: "Consolas", horizontalAlignment: "right" });
      sheet.cell(r, 13).value(channel?.outlierDominated ? "YES" : "—").style({
        ...base,
        fontFamily: "Consolas",
        horizontalAlignment: "center",
        fontColor: channel?.outlierDominated ? RED : "adb5bd",
        bold: Boolean(channel?.outlierDominated),
      });
      sheet.cell(r, 14).value(CONFIDENCE_LABEL[channel?.confidence] ?? "—").style({
        ...base,
        horizontalAlignment: "center",
      });
      r += 1;
    }
    const naver = product.naver?.trend;
    if (naver) {
      const zebra = r % 2 ? "ffffff" : "fbfaf7";
      const base = { fontSize: 9, fill: zebra };
      sheet.cell(r, 1).value(product.name).style(base);
      sheet.cell(r, 2).value("naver").style({ ...base, fontFamily: "Consolas" });
      sheet.cell(r, 3).value("datalab").style({ ...base, fontFamily: "Consolas" });
      sheet.cell(r, 6).value(naver.anchorNormalizedLatest30 ?? 0).style({ ...base, ...numberStyle, numberFormat: "0.00" });
      sheet.cell(r, 9)
        .value(
          entry.naver?.changeReliable
            ? `${naver.changePct > 0 ? "+" : ""}${naver.changePct}%`
            : "기저 미달",
        )
        .style({ ...base, fontFamily: "Consolas", horizontalAlignment: "right" });
      sheet.cell(r, 14).value(CONFIDENCE_LABEL[entry.naver?.confidence] ?? "—").style({
        ...base,
        horizontalAlignment: "center",
      });
      r += 1;
    }
  }
};

const buildFairness = (sheet: AnyRec) => {
  banner(sheet, "C", "형평성 진단 — 검색어·수집 보강 대상");
  let r = 4;
  const systemic: string[] = qualityMeta?.systemicIssues ?? [];
  for (const issue of systemic) {
    sheet.range(`A${r}:C${r}`).merged(true).value(`[전 제품 공통] ${issue}`).style({
      fill: "fff9ec",
      fontColor: "7a5000",
      bold: true,
      fontSize: 10,
      wrapText: true,
      verticalAlignment: "center",
    });
    sheet.row(r).height(30);
    r += 1;
  }
  r += 1;
  headerRow(sheet, r, ["제품", "판정", "보강 제안"]);
  r += 1;
  sheet.column("A").width(34);
  sheet.column("B").width(11);
  sheet.column("C").width(90);
  for (const [name, entry] of Object.entries(qualityProducts) as [string, AnyRec][]) {
    const suggestions: string[] = entry.fairness?.suggestions ?? [];
    if (!suggestions.length) continue;
    const verdict = VERDICT_STYLE[entry.verdict] ?? { label: "—", fill: "ffffff", color: INK };
    sheet.cell(r, 1).value(name).style({ fontSize: 9, bold: true, verticalAlignment: "top" });
    sheet.cell(r, 2).value(verdict.label).style({
      fontSize: 9,
      fill: verdict.fill,
      fontColor: verdict.color,
      horizontalAlignment: "center",
      verticalAlignment: "top",
    });
    sheet.cell(r, 3).value(suggestions.join("\n")).style({
      fontSize: 9,
      wrapText: true,
      fontColor: "4e5968",
    });
    sheet.row(r).height(Math.max(16, suggestions.length * 14));
    r += 1;
  }
};

const buildMethod = (sheet: AnyRec) => {
  banner(sheet, "B", "방법론 — 통계 보정 규칙");
  sheet.gridLinesVisible(false);
  sheet.column("A").width(4);
  sheet.column("B").width(110);
  const rules = [
    "1. 교차 제품 분할 — 같은 콘텐츠가 k개 제품에 채택되면 조회·반응을 k로 나눠 배분한다. 범용 비교 콘텐츠의 이중 계산을 제거한다.",
    "2. 수집 기간 필터 — YouTube 365일, Instagram·TikTok 180일을 벗어난 콘텐츠는 점수에서 제외한다.",
    "3. 표본 기회 균등화 — 검색어 시도 횟수에 따른 표본 편향을 상위 5개 콘텐츠 합계 상한으로 완화한다.",
    "4. 무결과와 수집 실패의 구분 — 검색 결과 없음·Google no_data는 0점(관심 부족 정보), rate_limited 등 수집 실패는 점수 분모에서 제외(무벌점).",
    "5. 변화율 노이즈 하한 — DataLab·Trends 30일(4주) 평균 지수가 1 미만이면 증감률을 해석하지 않는다.",
    "6. 신뢰도 등급 — 기간 내 표본 5개 미만 low, 5~9개 medium, 10개 이상 high. 공유 콘텐츠 조회 비중 50% 이상 채널은 low로 강등.",
    "7. 판정 — medium 이상 채널 2개 이상 '판단 가능', 일부 신호만 '주의', 그 외 '표본 부족'. '주의'·'표본 부족'은 순위만으로 수요를 단정하지 않는다.",
    "8. 점수 계산 — 채널 내 백분위(0~100)로 정규화한 뒤 사용자 가중치로 합산. 원시 숫자를 채널 간 직접 합산하지 않는다.",
  ];
  rules.forEach((rule, index) => {
    const row = 4 + index * 2;
    sheet.cell(row, 2).value(rule).style({ fontSize: 10, fontColor: "26303a", wrapText: true });
  });
};

export async function exportConfidentialReport(input: ReportInput) {
  const { default: XlsxPopulate } = await import(
    "xlsx-populate/browser/xlsx-populate.js"
  );
  const workbook = await XlsxPopulate.fromBlankAsync();
  const now = new Date();
  buildCover(workbook.sheet(0), input, now);
  buildRanking(workbook.addSheet("종합 순위"), input);
  buildRawData(workbook.addSheet("채널 원자료"));
  buildFairness(workbook.addSheet("형평성 진단"));
  buildMethod(workbook.addSheet("방법론"));
  workbook.activeSheet("표지");

  const blob: Blob = await workbook.outputAsync({ password: input.password });
  const dateStamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `[대외비] 제품수요조사_${dateStamp}_${input.presetName}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
