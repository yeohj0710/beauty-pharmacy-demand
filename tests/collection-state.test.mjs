import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const signals = JSON.parse(fs.readFileSync(new URL("../app/signals.json", import.meta.url), "utf8"));
const pageSource = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("zero-result sources are not reported as collected", () => {
  for (const product of signals.products) {
    if (product.google?.organicResultSampleCount === 0) {
      assert.notEqual(product.google.status, "collected");
    }
  }
});

test("snapshot progress is not labeled as actively collecting", () => {
  assert.equal(pageSource.includes('"수집 중"'), false);
});
