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

test("agent entry files route a cold-start agent to one command", () => {
  // Codex는 AGENTS.md를, 다른 에이전트는 CLAUDE.md를 먼저 읽는다.
  // 경로만 받은 에이전트가 추가 프롬프트 없이 착수할 수 있어야 한다.
  for (const entry of ["../AGENTS.md", "../CLAUDE.md"]) {
    const source = read(entry);
    assert.match(source, /npm run brief/, `${entry}: brief 명령 안내 누락`);
    assert.equal(source.includes("recollection-brief"), false);
  }
  assert.match(read("../AGENTS.md"), /docs\/recollection-runbook\.md/);
  assert.equal(
    fs.existsSync(new URL("../docs/recollection-brief.md", import.meta.url)),
    false,
  );

  const runbook = read("../docs/recollection-runbook.md");
  assert.match(runbook, /npm run brief/);
  for (const command of ["validate:signals", "audit:signals", "test:unit"]) {
    assert.ok(runbook.includes(command), `runbook missing ${command}`);
  }
});

test("brief output is self-contained: rules, work list, pipeline", () => {
  const output = execFileSync(process.execPath, ["scripts/plan-recollection.mjs"], {
    cwd: repo,
    encoding: "utf8",
  });
  // 규칙 요약 — 이 출력만 보고도 잘못 수집하지 않아야 한다.
  assert.match(output, /안 보이면 null이며 0이 아니다/);
  assert.match(output, /범용 콘텐츠.*채택하지/s);
  assert.match(output, /attemptedQueries/);
  assert.match(output, /로그인·CAPTCHA/);
  // 작업 목록 4단계.
  for (const priority of ["P0", "P1", "P2", "P3"]) {
    assert.ok(output.includes(priority), `missing ${priority}`);
  }
  // 완료 파이프라인 3단계와 커밋 안내.
  for (const command of [
    "npm run validate:signals",
    "npm run audit:signals",
    "npm run test:unit",
    "git push github main",
  ]) {
    assert.ok(output.includes(command), `brief missing ${command}`);
  }
  // 배포는 요청받았을 때만.
  assert.match(output, /배포.*요청받았을 때만/);
});

test("package exposes the collection scripts", () => {
  const pkg = JSON.parse(read("../package.json"));
  for (const script of [
    "brief",
    "plan:recollection",
    "validate:signals",
    "audit:signals",
  ]) {
    assert.ok(pkg.scripts[script], `missing npm script ${script}`);
  }
});
