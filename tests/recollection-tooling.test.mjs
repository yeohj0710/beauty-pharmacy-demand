import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import test from "node:test";

const repo = new URL("..", import.meta.url);
const read = (url) => fs.readFileSync(new URL(url, import.meta.url), "utf8");

test("planner reports the current work list from live data", () => {
  const output = execFileSync(
    process.execPath,
    ["scripts/plan-recollection.mjs", "--json"],
    { cwd: repo, encoding: "utf8" },
  );
  const plan = JSON.parse(output);
  const signals = JSON.parse(read("../app/signals.json"));

  assert.equal(plan.dataCollectedAt, signals.collectedAt);
  assert.equal(plan.products, signals.products.length);
  for (const key of ["p0Failures", "p1KeywordGaps", "p2UnderQueried", "p3ThinSamples"]) {
    assert.ok(Array.isArray(plan.tasks[key]), `${key} missing`);
  }

  // P0는 실제 실패 상태 채널만 잡아야 한다.
  const actualFailures = signals.products.flatMap((product) =>
    ["youtube", "instagram", "tiktok", "naver", "google"].filter((platform) =>
      ["rate_limited", "error", "blocked"].includes(product[platform]?.status),
    ),
  ).length;
  assert.equal(plan.tasks.p0Failures.length, actualFailures);

  // P1은 검색어가 2개 미만인 제품과 정확히 일치해야 한다.
  const actualKeywordGaps = signals.products.filter(
    (product) => (product.keywords || []).length < 2,
  ).length;
  assert.equal(plan.tasks.p1KeywordGaps.length, actualKeywordGaps);
});

test("agent entry points point at the runbook, not a stale brief", () => {
  const agents = read("../AGENTS.md");
  assert.match(agents, /docs\/recollection-runbook\.md/);
  assert.equal(agents.includes("recollection-brief"), false);
  assert.match(agents, /npm run plan:recollection/);

  assert.equal(fs.existsSync(new URL("../docs/recollection-brief.md", import.meta.url)), false);

  const runbook = read("../docs/recollection-runbook.md");
  // 낡기 쉬운 제품 명단을 문서에 박아두지 않는다.
  assert.match(runbook, /plan:recollection/);
  // 완료 파이프라인 세 단계가 모두 명시돼야 한다.
  for (const command of ["validate:signals", "audit:signals", "test:unit"]) {
    assert.ok(runbook.includes(command), `runbook missing ${command}`);
  }
});

test("package exposes the collection scripts", () => {
  const pkg = JSON.parse(read("../package.json"));
  for (const script of ["plan:recollection", "validate:signals", "audit:signals"]) {
    assert.ok(pkg.scripts[script], `missing npm script ${script}`);
  }
});
