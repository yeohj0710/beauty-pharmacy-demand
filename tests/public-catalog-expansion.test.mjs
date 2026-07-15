import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => JSON.parse(fs.readFileSync(path, "utf8"));

test("maps every public workbook candidate to one demand entity", () => {
  const sources = read("app/public-product-sources.json");
  const entities = read("app/demand-entities.json");
  const catalog = read("app/product-catalog.json");
  const byId = new Map(entities.map((entity) => [entity.id, entity]));

  assert.equal(sources.length, 32);
  assert.equal(entities.length, 83);
  assert.equal(byId.size, entities.length);

  for (const source of sources) {
    const entity = byId.get(source.entityId);
    assert.ok(entity, `missing entity ${source.entityId}`);
    assert.ok(
      [...entity.skuNames, ...(entity.sourceAliases || [])].includes(
        source.productName,
      ),
      `${source.productName} is not mapped to ${source.entityId}`,
    );
    assert.ok(
      catalog.products.includes(source.productName),
      `${source.productName} is missing from product catalog`,
    );
    assert.match(source.sourceUrl, /^https:\/\//);
  }
});
