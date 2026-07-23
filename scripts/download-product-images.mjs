import fs from "node:fs/promises";
import path from "node:path";

const catalogPath = "app/product-assets.json";
const outputDir = "public/product-images";
const assets = JSON.parse(await fs.readFile(catalogPath, "utf8"));
const extensions = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
]);

await fs.mkdir(outputDir, { recursive: true });
const existingFiles = await fs.readdir(outputDir);
const entityIds = new Set(assets.map((asset) => asset.entityId));
await Promise.all(
  existingFiles
    .filter((file) => entityIds.has(path.parse(file).name))
    .map((file) => fs.unlink(path.join(outputDir, file))),
);

for (const asset of assets) {
  if (!asset.sourceImageUrl) {
    console.error(`MISS ${asset.entityId}`);
    continue;
  }
  try {
    const response = await fetch(asset.sourceImageUrl, {
      headers: { "user-agent": "Mozilla/5.0 product-catalog/1.0", referer: asset.sourcePageUrl },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const type = (response.headers.get("content-type") || "").split(";")[0];
    const body = Buffer.from(await response.arrayBuffer());
    if (!type.startsWith("image/") || body.length < 2_000) {
      throw new Error(`${type || "unknown type"}, ${body.length} bytes`);
    }
    const ext = extensions.get(type) || path.extname(new URL(response.url).pathname).toLowerCase() || ".img";
    const file = `${asset.entityId}${ext}`;
    await fs.writeFile(path.join(outputDir, file), body);
    asset.localImagePath = `/product-images/${file}`;
    asset.downloadBytes = body.length;
    console.log(`OK   ${asset.entityId} ${Math.round(body.length / 1024)}KB`);
  } catch (error) {
    asset.localImagePath = "";
    asset.downloadError = String(error.message || error);
    console.error(`FAIL ${asset.entityId} ${asset.downloadError}`);
  }
}

await fs.writeFile(catalogPath, `${JSON.stringify(assets, null, 2)}\n`);
const ok = assets.filter((asset) => asset.localImagePath).length;
console.log(`downloaded ${ok}/${assets.length}`);
if (ok !== assets.length) process.exitCode = 1;
