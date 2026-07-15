import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("centers dashboard sections at a readable desktop width", () => {
  assert.match(
    css,
    /main\s*\{[^}]*width:\s*calc\(100% - var\(--sidebar\)\)[^}]*max-width:\s*none/s,
  );
  assert.match(
    css,
    /main\s*>\s*section\s*\{[^}]*width:\s*100%[^}]*max-width:\s*1280px[^}]*margin-left:\s*auto[^}]*margin-right:\s*auto/s,
  );
});
