import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const assets = JSON.parse(fs.readFileSync("app/product-assets.json", "utf8"));
const entities = JSON.parse(fs.readFileSync("app/demand-entities.json", "utf8"));
const catalog = JSON.parse(fs.readFileSync("app/product-catalog.json", "utf8"));

test("every demand entity has one sourced local product image", () => {
  assert.equal(assets.length, entities.length);
  assert.equal(new Set(assets.map((asset) => asset.entityId)).size, entities.length);

  for (const entity of entities) {
    const asset = assets.find((item) => item.entityId === entity.id);
    assert.ok(asset, `missing asset: ${entity.id}`);
    assert.match(asset.sourcePageUrl, /^https:\/\//, `missing source page: ${entity.id}`);
    assert.match(asset.sourceImageUrl, /^https:\/\//, `missing source image: ${entity.id}`);
    assert.notEqual(asset.sourceType, "unresolved", `unresolved source: ${entity.id}`);
    assert.match(asset.localImagePath, /^\/product-images\//, `missing local path: ${entity.id}`);
    const localFile = `public${asset.localImagePath}`;
    assert.ok(fs.existsSync(localFile), `missing local file: ${localFile}`);
    assert.ok(fs.statSync(localFile).size >= 2_000, `image too small: ${localFile}`);
  }
});

test("every sales catalog product resolves to an imaged demand entity", () => {
  const byName = new Map(
    entities.flatMap((entity) =>
      [...entity.skuNames, ...(entity.sourceAliases ?? []), entity.name].map((name) => [name, entity.id]),
    ),
  );
  const assetIds = new Set(assets.map((asset) => asset.entityId));
  for (const product of catalog.products) {
    const entityId = byName.get(product);
    assert.ok(entityId, `catalog product is not mapped: ${product}`);
    assert.ok(assetIds.has(entityId), `catalog product has no image: ${product}`);
  }
});
