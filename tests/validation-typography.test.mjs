import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("keeps product verification labels readable", () => {
  assert.match(css, /\.product-list b\s*\{[^}]*font-size:\s*15px/s);
  assert.match(css, /\.product-list small\s*\{[^}]*font-size:\s*12px/s);
  assert.match(
    css,
    /\.product-list button > span\s*\{[^}]*font-size:\s*12px/s,
  );
});
