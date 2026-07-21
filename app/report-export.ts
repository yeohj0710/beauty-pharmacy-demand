// 수요 데이터 XLSX 내보내기.
// 현재 대시보드 세팅(가중치·프리셋·직접 입력)이 반영된 순위 스냅샷을
// 단일 시트 데이터 테이블로 저장한다. 암호를 지정하면 Excel 표준
// 암호화(ECMA-376 Agile, 열람 암호)를 적용한다.
//
// 시트 레이아웃은 배포본(G 드라이브 보관본)과 동일하게 유지한다.
// 1행 제목 · 2행 헤더 · 3행부터 데이터 · 15열 고정.
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

const DOCUMENT_TITLE = "[웰니스박스] 약국 뷰티제품 마케팅 수요 데이터";
const PLATFORM_IDS = ["naver", "google", "youtube", "instagram", "tiktok"];

const INK = "1b2430";
const ZEBRA = "f7f8fa";
const LINE = "e5e8eb";
const NULL_MARK = "c5cbd3";

const qualityProducts = (qualityFile as AnyRec).products as AnyRec;
const productByName = new Map(
  (signalFile as AnyRec).products.map((product: AnyRec) => [product.name, product]),
);

// [헤더, 너비, 정렬] — 순서와 너비는 보관본과 일치해야 한다.
const COLUMNS: [string, number, "left" | "center" | "right"][] = [
  ["순위", 6, "center"],
  ["제품", 38, "left"],
  ["카테고리", 18, "left"],
  ["브랜드", 15, "left"],
  ["종합 점수", 10, "right"],
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
];
const LAST_COL = "O";
const HEADER_ROW = 2;

const buildSheet = (sheet: AnyRec, input: ReportInput) => {
  sheet.name("수요 데이터");
  sheet.gridLinesVisible(false);
  COLUMNS.forEach(([, width], index) => sheet.column(index + 1).width(width));

  sheet.range(`A1:${LAST_COL}1`).merged(true).value(DOCUMENT_TITLE).style({
    bold: true,
    fontSize: 16,
    fontColor: INK,
    verticalAlignment: "center",
  });
  sheet.row(1).height(30);

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

  input.rows.forEach((row, index) => {
    const r = HEADER_ROW + 1 + index;
    const product = productByName.get(row.name) as AnyRec | undefined;
    const quality = qualityProducts[row.name] ?? {};
    const base = {
      fontSize: 9,
      fill: index % 2 ? ZEBRA : "ffffff",
      verticalAlignment: "center",
      border: { bottom: { style: "thin", color: LINE } },
    };
    const num = { ...base, fontFamily: "Consolas", horizontalAlignment: "right" };

    sheet.cell(r, 1).value(row.rank).style({ ...num, horizontalAlignment: "center" });
    sheet.cell(r, 2).value(row.name).style({ ...base, bold: true });
    sheet.cell(r, 3).value(product?.category ?? "").style(base);
    sheet.cell(r, 4).value(product?.brand ?? "").style(base);
    sheet.cell(r, 5).value(Number(row.score.toFixed(1))).style({ ...num, bold: true, numberFormat: "0.0" });
    sheet.cell(r, 6).value(Math.round(row.coverage) / 100).style({ ...num, numberFormat: "0%" });
    PLATFORM_IDS.forEach((platform, platformIndex) => {
      const value = row.channelScores[platform];
      const cell = sheet.cell(r, 7 + platformIndex);
      if (value == null) {
        cell.value("—").style({ ...num, horizontalAlignment: "center", fontColor: NULL_MARK });
      } else {
        cell.value(Number(value.toFixed(1))).style({ ...num, numberFormat: "0.0" });
      }
    });
    sheet.cell(r, 12)
      .value(quality.youtube?.adjustedTotalViews ?? null)
      .style({ ...num, numberFormat: "#,##0" });
    sheet.cell(r, 13)
      .value(quality.tiktok?.adjustedViews ?? null)
      .style({ ...num, numberFormat: "#,##0" });
    sheet.cell(r, 14)
      .value(quality.instagram?.adjustedEngagement ?? null)
      .style({ ...num, numberFormat: "#,##0" });
    sheet.cell(r, 15)
      .value(product?.naver?.trend?.anchorNormalizedLatest30 ?? null)
      .style({ ...num, numberFormat: "0.00" });
  });
};

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// 저장 위치는 브라우저 보안 정책상 코드가 지정할 수 없다. 파일 저장
// 대화상자를 지원하는 브라우저에서는 파일명을 채운 채 폴더를 고르게 하고
// (다음 저장부터 같은 폴더가 기본값이 된다), 아니면 기본 다운로드로 받는다.
const saveBlob = async (blob: Blob, fileName: string) => {
  const picker = (window as AnyRec).showSaveFilePicker;
  if (typeof picker === "function") {
    try {
      const handle = await picker({
        suggestedName: fileName,
        types: [
          {
            description: "Excel 통합 문서",
            accept: { [XLSX_MIME]: [".xlsx"] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (error) {
      // 사용자가 대화상자를 취소한 경우는 저장하지 않고 그대로 종료한다.
      if ((error as AnyRec)?.name === "AbortError") return;
      // 그 외 실패는 기본 다운로드로 넘어간다.
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

export async function exportDemandReport(input: ReportInput) {
  const { default: XlsxPopulate } = await import(
    "xlsx-populate/browser/xlsx-populate.js"
  );
  const workbook = await XlsxPopulate.fromBlankAsync();
  buildSheet(workbook.sheet(0), input);

  const blob: Blob = input.password
    ? await workbook.outputAsync({ password: input.password })
    : await workbook.outputAsync();
  const now = new Date();
  const dateStamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  await saveBlob(blob, `${DOCUMENT_TITLE}_${dateStamp}.xlsx`);
}
