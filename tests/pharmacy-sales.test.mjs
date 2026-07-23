import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const encrypted = JSON.parse(
  await readFile(new URL("../app/pharmacy-sales.enc.json", import.meta.url), "utf8"),
);

test("커밋되는 매출 데이터는 암호문뿐이다", async () => {
  assert.equal(encrypted.v, 1);
  assert.equal(encrypted.kdf, "PBKDF2-SHA256");
  assert.ok(encrypted.iterations >= 100000, "PBKDF2 반복 횟수가 너무 낮음");
  for (const key of ["salt", "iv", "data"]) {
    assert.match(encrypted[key], /^[A-Za-z0-9+/=]+$/, `${key}는 base64여야 함`);
  }
  const raw = JSON.stringify(encrypted);
  for (const marker of ["퓨어약국", "애크논", "순이익", "판매금액"]) {
    assert.ok(!raw.includes(marker), `평문 유출: ${marker}`);
  }
});

test("잘못된 암호로는 복호화가 실패한다", async () => {
  const decode = (value) => Buffer.from(value, "base64");
  const keyMaterial = await webcrypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("wrong-password"),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const key = await webcrypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: decode(encrypted.salt),
      iterations: encrypted.iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  await assert.rejects(
    webcrypto.subtle.decrypt(
      { name: "AES-GCM", iv: decode(encrypted.iv) },
      key,
      decode(encrypted.data),
    ),
  );
});

test("평문 매출 JSON은 커밋 대상에서 제외된다", async () => {
  const gitignore = await readFile(new URL("../.gitignore", import.meta.url), "utf8");
  assert.match(gitignore, /^etc\/$/m, "etc/(평문 매출 JSON 위치)는 gitignore여야 함");
});

test("약국 실매출 뷰가 기본 화면이고 열람 게이트를 거친다", async () => {
  const [page, view] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/pharmacy-view.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /useState<\s*\n?\s*"pharmacy"/, "기본 뷰는 pharmacy");
  assert.match(page, /import PharmacyView, \{ useRevealOnScroll \} from "\.\/pharmacy-view"/);
  assert.match(view, /decryptPharmacySales/);
  // 매출 수치는 복호화 성공 후에만 렌더된다 — 게이트 컴포넌트가 존재해야 함
  assert.match(view, /SalesGate/);
  assert.match(view, /RestrictedBranch/);
  // 새로고침하면 다시 잠긴다 — 암호·복호화 결과를 브라우저 저장소에 남기지 않는다
  assert.doesNotMatch(view, /sessionStorage|localStorage/);
});

test("지점 디렉터리는 실제 상호 4곳이고 실매출 연동은 한 곳뿐이다", async () => {
  const data = await readFile(
    new URL("../app/pharmacy-data.ts", import.meta.url),
    "utf8",
  );
  for (const name of [
    "성수역퓨어약국",
    "명동레디영약국",
    "명동베리뉴약국",
    "그린서클약국",
  ]) {
    assert.ok(data.includes(name), `지점 누락: ${name}`);
  }
  assert.equal(data.match(/status: "live",/g)?.length, 1);
  assert.equal(data.match(/status: "restricted",/g)?.length, 3);
});
