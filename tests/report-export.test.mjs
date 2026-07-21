import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const read = (url) => fs.readFileSync(new URL(url, import.meta.url), "utf8");

test("xlsx password encryption round-trips and rejects wrong passwords", async () => {
  const XlsxPopulate = require("xlsx-populate");
  const workbook = await XlsxPopulate.fromBlankAsync();
  workbook.sheet(0).cell("A1").value("대외비");
  const encrypted = await workbook.outputAsync({ password: "correct-pw" });

  const reopened = await XlsxPopulate.fromDataAsync(encrypted, {
    password: "correct-pw",
  });
  assert.equal(reopened.sheet(0).cell("A1").value(), "대외비");

  await assert.rejects(
    XlsxPopulate.fromDataAsync(encrypted, { password: "wrong-pw" }),
  );
});

test("report module encrypts when a password is given and stays single-sheet", () => {
  const source = read("../app/report-export.ts");
  // 암호가 있으면 반드시 암호화 경로, 없을 때만 일반 경로를 타야 한다.
  assert.match(
    source,
    /input\.password\s*\n?\s*\? await workbook\.outputAsync\(\{ password: input\.password \}\)\s*\n?\s*: await workbook\.outputAsync\(\)/,
  );
  // 단일 시트 데이터 테이블 — 시트 추가 금지.
  assert.equal(source.includes("addSheet("), false);
  assert.match(source, /sheet\.name\("수요 데이터"\)/);
  // 모든 열은 명시적 너비를 가져 셀이 잘리지 않아야 한다.
  assert.ok(source.includes("COLUMNS.forEach"));
  assert.match(source, /\.width\(width\)/);
});

test("sheet layout matches the archived workbook", () => {
  const source = read("../app/report-export.ts");
  // 제목·파일명은 보관본과 동일한 문구를 쓴다.
  assert.match(
    source,
    /DOCUMENT_TITLE = "\[웰니스박스\] 약국 뷰티제품 마케팅 수요 데이터"/,
  );
  assert.match(source, /\$\{DOCUMENT_TITLE\}_\$\{dateStamp\}\.xlsx/);
  // 1행 제목 · 2행 헤더 · 3행부터 데이터.
  assert.match(source, /HEADER_ROW = 2/);
  // 15열, 순서 고정.
  const headers = [...source.matchAll(/^ {2}\["([^"]+)", \d+, "(?:left|center|right)"\],$/gm)]
    .map((match) => match[1]);
  assert.deepEqual(headers, [
    "순위",
    "제품",
    "카테고리",
    "브랜드",
    "종합 점수",
    "근거",
    "네이버",
    "Google",
    "YouTube",
    "Instagram",
    "TikTok",
    "YouTube 조회",
    "TikTok 조회",
    "Instagram 참여",
    "네이버 지수",
  ]);
  assert.match(source, /const LAST_COL = "O"/);
});

test("save flow prefers a folder picker and falls back to download", () => {
  const source = read("../app/report-export.ts");
  assert.match(source, /showSaveFilePicker/);
  assert.match(source, /suggestedName: fileName/);
  // 취소는 조용히 종료하고, 미지원 브라우저는 기본 다운로드로 넘어간다.
  assert.match(source, /AbortError/);
  assert.match(source, /link\.download = fileName/);
});

test("dashboard wires the export drawer to current settings", () => {
  const source = read("../app/page.tsx");
  assert.match(source, /className="export-button"/);
  assert.match(source, /import\("\.\/report-export"\)/);
  // 내보내기 행은 현재 가중치로 정렬된 순위(top)에서 만들어져야 한다.
  assert.match(source, /reportRows: ReportRow\[\] = top\.map/);
  // 6자 미만 암호로는 내보내기 버튼이 활성화되지 않아야 한다.
  assert.match(source, /password\.length < 6/);
});
