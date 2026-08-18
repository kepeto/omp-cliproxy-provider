import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeModelsDevCatalog, validateCatalogSize } from "../scripts/models-dev-catalog.mjs";

function filler(count: number): Record<string, { id: string }> {
  return Object.fromEntries(Array.from({ length: count }, (_, index) => [`provider/model-${index}`, { id: `provider/model-${index}` }]));
}

test("models.dev updater supports flat and provider-organized catalogs", () => {
  const normalized = normalizeModelsDevCatalog({
    ...filler(100),
    "xai/grok": { id: "xai/grok", reasoning: true },
    openai: { id: "openai", models: { gpt: { id: "gpt", reasoning: true } } },
  });

  assert.equal(normalized["openai/gpt"].id, "openai/gpt");
  assert.equal(normalized["xai/grok"].reasoning, true);
});

test("models.dev updater rejects catastrophic catalog shrinkage", () => {
  assert.throws(() => validateCatalogSize(filler(200), filler(50)), /shrank from 200 to 50/);
});
