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

test("server-renders the product demand dashboard", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>뷰티 약국 수요 데이터 \| 웰니스박스<\/title>/i);
  // 기본 화면은 약국 실매출 뷰다.
  assert.match(html, /뷰티 약국 실매출을/);
  assert.match(html, /퓨어약국 성수점/);
  assert.match(html, /온라인 수요 신호/);
  assert.match(html, /조사 제품 (?:<!-- -->)?96/);
  // 매출 수치·상품명은 열람 암호 없이 서버 HTML에 노출되지 않는다.
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
