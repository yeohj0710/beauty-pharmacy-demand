// etc/pharmacy-sales.local.json(평문)을 열람 암호로 잠근
// app/pharmacy-sales.enc.json(AES-256-GCM)으로 변환한다.
//
// 사용:  node scripts/encrypt-pharmacy-sales.mjs --password <암호>
//        (또는 PHARMACY_DATA_PASSWORD 환경변수)
//
// 저장소는 공개이므로 암호와 평문 JSON은 절대 커밋하지 않는다.
// 브라우저는 같은 파라미터(PBKDF2-SHA256 → AES-256-GCM)로 복호화한다.
import { webcrypto } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const ITERATIONS = 310000;
const plainPath = fileURLToPath(
  new URL("../etc/pharmacy-sales.local.json", import.meta.url),
);
const outPath = fileURLToPath(
  new URL("../app/pharmacy-sales.enc.json", import.meta.url),
);

const argIndex = process.argv.indexOf("--password");
const password =
  (argIndex >= 0 ? process.argv[argIndex + 1] : "") ||
  process.env.PHARMACY_DATA_PASSWORD ||
  "";
if (!password) {
  console.error(
    "열람 암호가 필요합니다: --password <암호> 또는 PHARMACY_DATA_PASSWORD",
  );
  process.exit(1);
}

const plain = await readFile(plainPath, "utf8");
JSON.parse(plain); // 평문이 올바른 JSON인지 먼저 확인

const salt = webcrypto.getRandomValues(new Uint8Array(16));
const iv = webcrypto.getRandomValues(new Uint8Array(12));
const keyMaterial = await webcrypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(password),
  "PBKDF2",
  false,
  ["deriveKey"],
);
const key = await webcrypto.subtle.deriveKey(
  { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
  keyMaterial,
  { name: "AES-GCM", length: 256 },
  false,
  ["encrypt"],
);
const ciphertext = await webcrypto.subtle.encrypt(
  { name: "AES-GCM", iv },
  key,
  new TextEncoder().encode(plain),
);

const b64 = (bytes) => Buffer.from(bytes).toString("base64");
await writeFile(
  outPath,
  JSON.stringify(
    {
      v: 1,
      kdf: "PBKDF2-SHA256",
      iterations: ITERATIONS,
      salt: b64(salt),
      iv: b64(iv),
      data: b64(new Uint8Array(ciphertext)),
    },
    null,
    1,
  ),
);
console.log(`encrypted → ${outPath} (${Buffer.byteLength(plain)} bytes plain)`);
