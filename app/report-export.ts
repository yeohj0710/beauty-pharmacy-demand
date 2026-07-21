// 수요 데이터 XLSX 내보내기.
// 현재 대시보드 세팅(가중치·프리셋·직접 입력)이 반영된 순위 스냅샷을
// 단일 시트 데이터 테이블로 저장한다. 암호를 지정하면 Excel 표준
// 암호화(ECMA-376 Agile, 열람 암호)를 적용한다.
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
  /** 비어 있으면 암호 없이 내보낸다. */
  password?: string;
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
const MUTED = "8b95a1";
const ZEBRA = "f7f8fa";
const LINE = "e5e8eb";
const VERDICT_TEXT: AnyRec = {
  usable: { label: "판단 가능", color: "087f5b" },
  caution: { label: "주의", color: "b35c00" },
  insufficient: { label: "표본 부족", color: "c92a2a" },
};

const qualityProducts = (qualityFile as AnyRec).products as AnyRec;
const productByName = new Map(
  (signalFile as AnyRec).products.map((product: AnyRec) => [product.name, product]),
);

const stamp = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

// 열 정의: [헤더, 너비, 정렬]
const COLUMNS: [string, number, "left" | "center" | "right"][] = [
  ["순위", 6, "center"],
  ["제품", 38, "left"],
  ["카테고리", 18, "left"],
  ["브랜드", 15, "left"],
  ["종합 점수", 10, "right"],
  ["판정", 10, "center"],
  ["근거", 7, "right"],
  ["네이버", 8, "right"],
  ["Google", 8, "right"],
  ["YouTube", 9, "right"],
  ["Instagram", 10, "right"],
  ["TikTok", 8, "right"],
  ["YouTube 조회", 13, "right"],
  ["TikTok 조회", 13, "right"],
  ["Instagram 참여", 14, "right"],
  ["네이버 지수", 11, "right"],
  ["표본 YT·IG·TT", 13, "center"],
  ["대표 검색어", 42, "left"],
];
const LAST_COL = "R";
const HEADER_ROW = 5;

const buildSheet = (sheet: AnyRec, input: ReportInput, now: Date) => {
  sheet.name("수요 데이터");
  sheet.gridLinesVisible(false);

  COLUMNS.forEach(([, width], index) => {
    sheet.column(index + 1).width(width);
  });

  // 타이틀 블록 — 라벨과 값만, 문장 없음
  sheet.range(`A1:${LAST_COL}1`).merged(true).value("약국·뷰티 제품 수요 인덱스").style({
    bold: true,
    fontSize: 16,
    fontColor: INK,
    verticalAlignment: "center",
  });
  sheet.row(1).height(30);
  sheet.range(`A2:${LAST_COL}2`).merged(true)
    .value("K-PHARMACY & BEAUTY PRODUCT DEMAND INDEX")
    .style({
      fontSize: 9,
      fontColor: MUTED,
      fontFamily: "Consolas",
      verticalAlignment: "center",
    });
  const weightText = PLATFORMS.map(
    (platform) => `${platform.name} ${input.weights[platform.id] ?? 0}`,
  ).join(" · ");
  sheet.range(`A3:${LAST_COL}3`).merged(true)
    .value(
      `데이터 기준 ${String(signalFile.collectedAt).replace("T", " ").slice(0, 16)} KST   |   세팅 ${input.presetName} (${weightText})   |   제품 ${input.rows.length}   |   직접 입력 ${input.manualCount}건   |   생성 ${stamp(now)}`,
    )
    .style({ fontSize: 9, fontColor: "4e5968", verticalAlignment: "center" });
  sheet.row(3).height(20);
  sheet.row(4).height(8);

  // 헤더
  COLUMNS.forEach(([label, , align], index) => {
    sheet.cell(HEADER_ROW, index + 1).value(label).style({
      fill: INK,
      fontColor: "ffffff",
      bold: true,
      fontSize: 9,
      horizontalAlignment: align,
      verticalAlignment: "center",
    });
  });
  sheet.row(HEADER_ROW).height(24);
  sheet.freezePanes(2, HEADER_ROW);

  // 데이터
  input.rows.forEach((row, index) => {
    const r = HEADER_ROW + 1 + index;
    const product = productByName.get(row.name) as AnyRec | undefined;
    const quality = qualityProducts[row.name] ?? {};
    const verdict = VERDICT_TEXT[quality.verdict] ?? { label: "—", color: MUTED };
    const fill = index % 2 ? ZEBRA : "ffffff";
    const base = {
      fontSize: 9,
      fill,
      verticalAlignment: "center",
      border: { bottom: { style: "thin", color: LINE } },
    };
    const num = { ...base, fontFamily: "Consolas", horizontalAlignment: "right" };

    sheet.cell(r, 1).value(row.rank).style({ ...num, horizontalAlignment: "center" });
    sheet.cell(r, 2).value(row.name).style({ ...base, bold: true });
    sheet.cell(r, 3).value(product?.category ?? "").style(base);
    sheet.cell(r, 4).value(product?.brand ?? "").style(base);
    sheet.cell(r, 5).value(Number(row.score.toFixed(1))).style({ ...num, bold: true, numberFormat: "0.0" });
    sheet.cell(r, 6).value(verdict.label).style({
      ...base,
      fontColor: verdict.color,
      bold: true,
      horizontalAlignment: "center",
    });
    sheet.cell(r, 7).value(Math.round(row.coverage) / 100).style({ ...num, numberFormat: "0%" });
    PLATFORMS.forEach((platform, platformIndex) => {
      const value = row.channelScores[platform.id];
      const cell = sheet.cell(r, 8 + platformIndex);
      if (value == null) {
        cell.value("—").style({ ...num, horizontalAlignment: "center", fontColor: "c5cbd3" });
      } else {
        cell.value(Number(value.toFixed(1))).style({ ...num, numberFormat: "0.0" });
      }
    });
    sheet.cell(r, 13)
      .value(quality.youtube?.adjustedTotalViews ?? null)
      .style({ ...num, numberFormat: "#,##0" });
    sheet.cell(r, 14)
      .value(quality.tiktok?.adjustedViews ?? null)
      .style({ ...num, numberFormat: "#,##0" });
    sheet.cell(r, 15)
      .value(quality.instagram?.adjustedEngagement ?? null)
      .style({ ...num, numberFormat: "#,##0" });
    sheet.cell(r, 16)
      .value(product?.naver?.trend?.anchorNormalizedLatest30 ?? null)
      .style({ ...num, numberFormat: "0.00" });
    sheet.cell(r, 17)
      .value(
        `${quality.youtube?.adjustedSampleCount ?? 0} · ${quality.instagram?.adjustedSampleCount ?? 0} · ${quality.tiktok?.adjustedSampleCount ?? 0}`,
      )
      .style({ ...num, horizontalAlignment: "center" });
    sheet.cell(r, 18).value(row.keywords.join(", ")).style({ ...base, fontColor: "4e5968" });
  });

  // 푸터 — 출처·보정 기준 토큰
  const footer = HEADER_ROW + input.rows.length + 2;
  sheet.range(`A${footer}:${LAST_COL}${footer}`).merged(true)
    .value(
      "출처 공개 웹 신호 (네이버 DataLab · Google Trends · YouTube · Instagram · TikTok)   |   보정 교차중복 분할 · 기간 필터(YT 365d, IG·TT 180d) · 상위 5개 상한   |   점수 채널 내 백분위 0–100",
    )
    .style({ fontSize: 8, fontColor: MUTED });
};

export async function exportDemandReport(input: ReportInput) {
  const { default: XlsxPopulate } = await import(
    "xlsx-populate/browser/xlsx-populate.js"
  );
  const workbook = await XlsxPopulate.fromBlankAsync();
  const now = new Date();
  buildSheet(workbook.sheet(0), input, now);

  const blob: Blob = input.password
    ? await workbook.outputAsync({ password: input.password })
    : await workbook.outputAsync();
  const dateStamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `약국뷰티_수요인덱스_${dateStamp}_${input.presetName}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
