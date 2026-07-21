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

test("report module always encrypts and lays out the confidential sheets", () => {
  const source = read("../app/report-export.ts");
  // 암호 없이 outputAsync를 호출하는 경로가 없어야 한다.
  assert.match(source, /outputAsync\(\{ password: input\.password \}\)/);
  assert.equal(/outputAsync\(\s*\)/.test(source), false);
  for (const sheet of ["종합 순위", "채널 원자료", "형평성 진단", "방법론"]) {
    assert.ok(source.includes(`addSheet("${sheet}")`), `missing sheet ${sheet}`);
  }
  assert.match(source, /대외비 · CONFIDENTIAL/);
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
