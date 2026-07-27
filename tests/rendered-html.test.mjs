import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the dashboard shell with private sales data locked", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>프라이빗 약국 데이터 인텔리전스 \| 웰니스박스<\/title>/i);
  assert.match(html, /약국 매출 .*인텔리전스/);
  assert.match(html, /약국 실판매 데이터/);
  assert.match(html, /마켓 수요 인텔리전스/);
  assert.match(html, /데이터 수집/);
  assert.match(html, /제품 검증/);
  assert.match(html, /조사 관리/);
  assert.match(html, /열람 비밀번호를 입력하세요/);
  assert.match(html, /성수퓨어약국/);
  // 비밀번호 인증 전에는 매출 상품명과 수치가 서버 HTML에 노출되지 않는다.
  assert.doesNotMatch(html, /애크논크림/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Codex is working/i);
});

test("uses canonical product and signal data without starter preview files", async () => {
  const [page, signals, entities] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/signals.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../app/demand-entities.json", import.meta.url), "utf8").then(JSON.parse),
  ]);

  assert.equal(signals.products.length, 96);
  assert.equal(entities.length, 96);
  assert.match(page, /import signalFile from "\.\/signals\.json"/);
  assert.match(page, /import catalog from "\.\/product-catalog\.json"/);
  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
});

test("다른 탭으로 이동할 때마다 열람 비밀번호를 확인한다", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /requestView\(n\[0\]\)/);
  assert.match(page, /navigationPassword === "kwonhc0903!"/);
  assert.match(page, /탭 이동 인증/);
});
