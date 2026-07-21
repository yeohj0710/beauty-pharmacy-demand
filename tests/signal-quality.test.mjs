import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import test from "node:test";

const read = (url) => JSON.parse(fs.readFileSync(new URL(url, import.meta.url), "utf8"));
const signals = read("../app/signals.json");
const quality = read("../app/signal-quality.json");

test("signal-quality.json is in sync with signals.json", () => {
  assert.equal(quality.meta.auditedAt, signals.collectedAt);
  assert.equal(Object.keys(quality.products).length, signals.products.length);
  for (const product of signals.products) {
    assert.ok(quality.products[product.name], `missing quality for ${product.name}`);
  }
});

test("current signals pass the data-contract validator", () => {
  const output = execFileSync(
    process.execPath,
    ["scripts/validate-signals.mjs"],
    { cwd: new URL("..", import.meta.url), encoding: "utf8" },
  );
  assert.match(output, /ERROR 0건/);
});

test("audit script is deterministic against current signals", () => {
  execFileSync(process.execPath, ["scripts/audit-signals.mjs"], {
    cwd: new URL("..", import.meta.url),
  });
  const regenerated = read("../app/signal-quality.json");
  assert.deepEqual(regenerated, quality);
});

test("shared content is split, so adjusted views never exceed raw views", () => {
  for (const product of signals.products) {
    const entry = quality.products[product.name];
    if (product.youtube?.status === "collected" && entry.youtube) {
      const raw = (product.youtube.topVideos || []).reduce(
        (sum, video) => sum + (video.views || 0),
        0,
      );
      assert.ok(
        entry.youtube.adjustedTotalViews <= raw + 1,
        `${product.name}: adjusted ${entry.youtube.adjustedTotalViews} > raw ${raw}`,
      );
    }
  }
});

test("every video shared across products is attributed fractionally", () => {
  const owners = new Map();
  for (const product of signals.products) {
    for (const video of product.youtube?.topVideos || []) {
      owners.set(video.id, (owners.get(video.id) || 0) + 1);
    }
  }
  const sharedIds = new Set(
    [...owners.entries()].filter(([, count]) => count > 1).map(([id]) => id),
  );
  // 공유 영상이 있는 제품은 보정 합계가 원시 합계보다 작아야 한다.
  for (const product of signals.products) {
    const videos = product.youtube?.topVideos || [];
    const sharedViews = videos
      .filter((video) => sharedIds.has(video.id))
      .reduce((sum, video) => sum + (video.views || 0), 0);
    if (!sharedViews) continue;
    const raw = videos.reduce((sum, video) => sum + (video.views || 0), 0);
    const entry = quality.products[product.name]?.youtube;
    if (!entry || entry.staleCount > 0) continue;
    assert.ok(
      entry.adjustedTotalViews < raw,
      `${product.name}: shared views not discounted`,
    );
  }
});

test("confidence tiers follow the protocol sample thresholds", () => {
  for (const entry of Object.values(quality.products)) {
    for (const key of ["youtube", "instagram", "tiktok"]) {
      const channel = entry[key];
      if (!channel) continue;
      const expected =
        channel.adjustedSampleCount >= 10
          ? "high"
          : channel.adjustedSampleCount >= 5
            ? "medium"
            : "low";
      assert.equal(channel.confidence, expected);
    }
  }
});

test("naver change rate is only marked reliable above the noise floor", () => {
  for (const product of signals.products) {
    const trend = product.naver?.trend;
    const entry = quality.products[product.name]?.naver;
    if (!trend || !entry) continue;
    if (entry.changeReliable) {
      assert.ok(trend.latest30Mean >= 1 && trend.previous30Mean >= 1);
      assert.notEqual(trend.changePct, null);
    }
  }
});

test("top-capped score inputs never exceed full adjusted totals", () => {
  for (const entry of Object.values(quality.products)) {
    if (entry.youtube) {
      assert.ok(entry.youtube.adjustedTopViews <= entry.youtube.adjustedTotalViews);
    }
    for (const key of ["instagram", "tiktok"]) {
      const channel = entry[key];
      if (!channel) continue;
      assert.ok(channel.adjustedTopViews <= channel.adjustedViews);
      assert.ok(channel.adjustedTopEngagement <= channel.adjustedEngagement);
    }
  }
});

test("every product carries fairness diagnostics", () => {
  for (const [name, entry] of Object.entries(quality.products)) {
    assert.ok(entry.fairness, `${name}: missing fairness`);
    assert.ok(Array.isArray(entry.fairness.suggestions));
    assert.ok(entry.fairness.keywordCount >= 1, `${name}: no keywords`);
  }
  // 대상 제품의 90% 이상에 해당하는 격차만 전역 이슈로 보고해야 한다.
  for (const [platform, label] of [
    ["youtube", "YouTube"],
    ["instagram", "Instagram"],
    ["tiktok", "TikTok"],
  ]) {
    const eligible = signals.products.filter(
      (product) => (product.keywords || []).length >= 2 && product[platform],
    );
    const under = eligible.filter(
      (product) => (product[platform].attemptedQueries || []).length < 2,
    );
    const expectedSystemic = eligible.length > 0 && under.length / eligible.length >= 0.9;
    const reportedSystemic = quality.meta.systemicIssues.some((text) => text.includes(label));
    assert.equal(reportedSystemic, expectedSystemic, `${label}: systemic issue mismatch`);

    if (expectedSystemic) {
      const productLevelNags = Object.values(quality.products).filter((entry) =>
        entry.fairness.suggestions.some((text) => text.startsWith(label)),
      ).length;
      assert.equal(productLevelNags, 0, `${label}: systemic issue duplicated per product`);
    }
  }
});

test("collection failures are exempt from scoring, not zero-scored", () => {
  const pageSource = fs.readFileSync(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  // 가중 평균 분모가 null 채널을 제외하는 구현이어야 한다.
  assert.match(
    pageSource,
    /scores\[platform\.id\] == null \? 0 : weights\[platform\.id\]/,
  );
  // Google no_data는 0점 처리(무결과=정보)여야 한다.
  assert.match(pageSource, /platform === "google" && value\?\.status === "no_data"/);
});

test("every product gets a verdict and the dashboard renders it", () => {
  const verdicts = new Set(["usable", "caution", "insufficient"]);
  for (const [name, entry] of Object.entries(quality.products)) {
    assert.ok(verdicts.has(entry.verdict), `${name}: bad verdict ${entry.verdict}`);
  }
  const pageSource = fs.readFileSync(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(pageSource, /verdict-badge/);
  assert.match(pageSource, /signal-quality\.json/);
});
