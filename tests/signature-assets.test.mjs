import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const assets = JSON.parse(fs.readFileSync("app/signature-assets.json", "utf8"));
const sources = JSON.parse(
  fs.readFileSync("scripts/signature-product-sources.json", "utf8"),
);

test("지점 시그니처 품목마다 출처가 확인된 로컬 이미지가 있다", () => {
  assert.equal(assets.length, sources.length);
  for (const source of sources) {
    const asset = assets.find((item) => item.entityId === source.id);
    assert.ok(asset, `자산 누락: ${source.id}`);
    assert.equal(asset.productName, source.name, `품명 불일치: ${source.id}`);
    assert.match(asset.sourcePageUrl, /^https:\/\//, `출처 페이지 없음: ${source.id}`);
    assert.match(asset.sourceImageUrl, /^https:\/\//, `출처 이미지 없음: ${source.id}`);
    assert.ok(
      ["official-brand", "retailer"].includes(asset.sourceType),
      `출처 유형 미확정: ${source.id}`,
    );
    const localFile = `public${asset.localImagePath}`;
    assert.match(asset.localImagePath, /^\/product-images\//, `로컬 경로 없음: ${source.id}`);
    assert.ok(fs.existsSync(localFile), `로컬 파일 없음: ${localFile}`);
    assert.ok(fs.statSync(localFile).size >= 2_000, `이미지가 너무 작음: ${localFile}`);
  }
});

test("시그니처 품명이 매출 생성 스크립트와 일치한다", () => {
  const script = fs.readFileSync("scripts/extract-pharmacy-sales.py", "utf8");
  for (const source of sources) {
    assert.ok(
      script.includes(`sig("${source.name}"`),
      `매출 데이터에 없는 시그니처 품목: ${source.name}`,
    );
  }
});

test("매출 화면이 두 이미지 카탈로그를 함께 사용한다", () => {
  const view = fs.readFileSync("app/pharmacy-view.tsx", "utf8");
  assert.match(view, /import signatureAssets from "\.\/signature-assets\.json"/);
  assert.match(view, /signatureAssets\.map\(\(asset\) => \[asset\.productName, asset\]/);
});
