import test from "node:test";
import assert from "node:assert/strict";
import { buildProviderModels, PI_MODEL_DEFAULTS } from "../src/provider.ts";
import { GPT_5_6_THINKING } from "../src/model-capabilities.ts";
import type { CpaModel } from "../src/cpa.ts";

const cpaModels: CpaModel[] = [
  { id: "gpt-5.5", object: "model", owned_by: "openai", created: 1776902400 },
  { id: "claude-opus-4-6-thinking", object: "model", owned_by: "antigravity" },
  { id: "unknown-local", object: "model", owned_by: "feedmob-litellm" }
];

const catalog = {
  "openai/gpt-5.5": {
    id: "openai/gpt-5.5",
    name: "GPT-5.5",
    reasoning: true,
    modalities: { input: ["text", "image", "pdf"], output: ["text"] },
    limit: { context: 1050000, output: 128000 },
    cost: { input: 3, output: 18, cache_read: 0.3, cache_write: 3 }
  },
  "anthropic/claude-opus-4-6": {
    id: "anthropic/claude-opus-4-6",
    name: "Claude Opus 4.6",
    reasoning: true,
    modalities: { input: ["text", "image"], output: ["text"] },
    limit: { context: 1000000, output: 128000 },
    cost: { input: 5, output: 25 }
  }
};

test("enriches matched models but preserves CPA model IDs", () => {
  const result = buildProviderModels(cpaModels, catalog, {
    "claude-opus-4-6-thinking": "anthropic/claude-opus-4-6"
  });

  assert.equal(result.models[0].id, "gpt-5.5");
  assert.equal(result.models[0].name, "GPT-5.5");
  assert.deepEqual(result.models[0].input, ["text", "image"]);
  assert.equal(result.models[0].contextWindow, 1050000);
  assert.equal(result.models[1].id, "claude-opus-4-6-thinking");
  assert.equal(result.models[1].name, "Claude Opus 4.6");
  assert.equal(result.stats.enriched, 2);
});

test("uses explicit pi defaults for unmatched dynamic models", () => {
  const result = buildProviderModels([cpaModels[2]], catalog, {});

  assert.deepEqual(result.models[0], {
    id: "unknown-local",
    name: "unknown-local",
    ...PI_MODEL_DEFAULTS
  });
  assert.equal(result.stats.unmatched, 1);
});

test("does not share mutable default objects between fallback models", () => {
  const result = buildProviderModels([{ id: "a" }, { id: "b" }], {}, {});

  result.models[0].input.push("image");
  result.models[0].cost.input = 99;

  assert.deepEqual(result.models[1].input, ["text"]);
  assert.equal(result.models[1].cost.input, 0);
});

test("adds the full OMP thinking config to every GPT-5.6 model family member", () => {
  const result = buildProviderModels([
    { id: "gpt-5.6-luna" },
    { id: "0xdev/gpt-5.6-sol" },
    { id: "gpt-5.6-terra" },
  ], catalog, {});

  for (const model of result.models) {
    assert.equal(model.reasoning, true);
    assert.deepEqual(model.thinking, GPT_5_6_THINKING);
  }
});

test("routes GPT-5.6 family models through the Responses API", () => {
  const result = buildProviderModels([
    { id: "gpt-5.6" },
    { id: "gpt-5.6-codex" },
    { id: "0xdev/gpt-5.6-codex-mini" },
    { id: "gpt-5.60" },
    { id: "claude-opus-4-6" },
  ], {}, {});

  assert.deepEqual(result.models.map((model) => model.api), [
    "openai-responses",
    "openai-responses",
    "openai-responses",
    undefined,
    undefined,
  ]);
});

test("uses provider pricing while keeping the canonical GPT-5.6 context window by default", () => {
  const providerCatalog = {
    "openai/gpt-5.6-sol": {
      id: "openai/gpt-5.6-sol",
      limit: { context: 1050000, output: 128000 },
      cost: {
        input: 5,
        output: 30,
        cache_read: 0.5,
        cache_write: 6.25,
        tiers: [{
          input: 10,
          output: 45,
          cache_read: 1,
          cache_write: 12.5,
          tier: { type: "context", size: 272000 },
        }],
      },
    },
    "routing-run/gpt-5.6-sol": {
      id: "routing-run/gpt-5.6-sol",
      limit: { context: 1000000, output: 128000 },
      cost: { input: 2.5, output: 15 },
    },
  };
  const result = buildProviderModels(
    [{ id: "gpt-5.6-sol", owned_by: "openai" }],
    providerCatalog,
    {},
  );

  assert.deepEqual(result.models[0].cost, {
    input: 5,
    output: 30,
    cacheRead: 0.5,
    cacheWrite: 6.25,
    tiers: [{ inputTokensAbove: 272000, input: 10, output: 45, cacheRead: 1, cacheWrite: 12.5 }],
  });
  assert.equal(result.models[0].contextWindow, 272000);
  assert.equal(result.models[0].maxTokens, 128000);
  assert.equal(result.stats.matchMethods["owner-prefix"], 1);
  assert.equal(result.stats.unmatched, 0);

  const full = buildProviderModels(
    [{ id: "gpt-5.6-sol", owned_by: "openai" }],
    providerCatalog,
    {},
    "full",
  );
  assert.equal(full.models[0].contextWindow, 1050000);
  assert.deepEqual(full.models[0].cost, result.models[0].cost);
});

test("recognizes GPT-5.6 through a canonical metadata alias", () => {
  const result = buildProviderModels(
    [{ id: "custom-luna" }],
    {
      "openai/gpt-5.6-luna": {
        id: "openai/gpt-5.6-luna",
        name: "GPT-5.6 Luna",
        reasoning: true,
      },
    },
    { "custom-luna": "openai/gpt-5.6-luna" },
  );

  assert.equal(result.models[0].reasoning, true);
  assert.equal(result.models[0].api, "openai-responses");
  assert.deepEqual(result.models[0].thinking, GPT_5_6_THINKING);
  assert.equal(result.models[0].contextWindow, 272000);
});

test("adds GPT-5.6 capabilities even when metadata is unavailable", () => {
  const result = buildProviderModels([{ id: "0xdev/gpt-5.6-luna" }], {}, {});

  assert.equal(result.models[0].reasoning, true);
  assert.deepEqual(result.models[0].thinking, GPT_5_6_THINKING);
  assert.equal(result.models[0].contextWindow, 272000);
});

test("preserves tier suffixes like :free in matched model display names", () => {
  const result = buildProviderModels(
    [{ id: "nous-portal-free/tencent/hy3:free", owned_by: "feedmob-litellm" }],
    {
      "tencent/hy3": { id: "tencent/hy3", name: "Hy3" },
    },
    {},
  );

  assert.equal(result.models[0].id, "nous-portal-free/tencent/hy3:free");
  assert.equal(result.models[0].name, "nous-portal-free/Hy3:free");
  assert.equal(result.stats.enriched, 1);
  assert.equal(result.stats.unmatched, 0);
});

test("does not duplicate suffixes already present in metadata names", () => {
  const result = buildProviderModels(
    [{ id: "provider/model:free", owned_by: "feedmob-litellm" }],
    {
      "provider/model:free": { id: "provider/model:free", name: "Model Free" },
    },
    {},
  );

  assert.equal(result.models[0].id, "provider/model:free");
  assert.equal(result.models[0].name, "Model Free");
  assert.equal(result.stats.enriched, 1);
});

test("keeps unmatched model names as the full CPA ID", () => {
  const result = buildProviderModels(
    [{ id: "unknown/model:free" }],
    {},
    {},
  );

  assert.equal(result.models[0].id, "unknown/model:free");
  assert.equal(result.models[0].name, "unknown/model:free");
  assert.equal(result.stats.unmatched, 1);
});

test("includes gateway prefix to distinguish same-named models from different providers", () => {
  const result = buildProviderModels(
    [
      { id: "gateway-a/tencent/hy3:free", owned_by: "feedmob-litellm" },
      { id: "gateway-b/tencent/hy3:free", owned_by: "feedmob-litellm" },
    ],
    {
      "tencent/hy3": { id: "tencent/hy3", name: "Hy3" },
    },
    {},
  );

  assert.equal(result.models[0].id, "gateway-a/tencent/hy3:free");
  assert.equal(result.models[0].name, "gateway-a/Hy3:free");
  assert.equal(result.models[1].id, "gateway-b/tencent/hy3:free");
  assert.equal(result.models[1].name, "gateway-b/Hy3:free");
  assert.equal(result.stats.enriched, 2);
});

test("does not add prefix when CPA ID aligns exactly with metadata segments", () => {
  const result = buildProviderModels(
    [{ id: "tencent/hy3:free", owned_by: "feedmob-litellm" }],
    {
      "tencent/hy3": { id: "tencent/hy3", name: "Hy3" },
    },
    {},
  );

  assert.equal(result.models[0].id, "tencent/hy3:free");
  assert.equal(result.models[0].name, "Hy3:free");
  assert.equal(result.stats.enriched, 1);
});

test("does not add misleading prefix when gateway segments do not align with metadata owner", () => {
  const result = buildProviderModels(
    [{ id: "proxy/hy3:free", owned_by: "feedmob-litellm" }],
    {
      "tencent/hy3": { id: "tencent/hy3", name: "Hy3" },
    },
    {},
  );

  assert.equal(result.models[0].id, "proxy/hy3:free");
  assert.equal(result.models[0].name, "Hy3:free");
  assert.equal(result.stats.enriched, 1);
});
