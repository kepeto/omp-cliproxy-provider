import test from "node:test";
import assert from "node:assert/strict";
import { findMetadataMatch, normalizeModelName } from "../src/matching.ts";

const catalog = {
  "openai/gpt-5.5": { id: "openai/gpt-5.5", name: "GPT-5.5" },
  "deepseek/deepseek-v4-flash": { id: "deepseek/deepseek-v4-flash", name: "DeepSeek V4 Flash" },
  "minimax/MiniMax-M2.7": { id: "minimax/MiniMax-M2.7", name: "MiniMax-M2.7" },
  "anthropic/claude-opus-4-6": { id: "anthropic/claude-opus-4-6", name: "Claude Opus 4.6" },
  "google/gemini-3.1-flash-image-preview": { id: "google/gemini-3.1-flash-image-preview", name: "Nano Banana 2" }
};

test("normalizes model IDs for punctuation and case-insensitive matching", () => {
  assert.equal(normalizeModelName("MiniMax-M2.7"), "minimaxm27");
  assert.equal(normalizeModelName("minimax:m2-7"), "minimaxm27");
});

test("uses metadata-only aliases before heuristics", () => {
  const match = findMetadataMatch(
    { id: "claude-opus-4-6-thinking", owned_by: "antigravity" },
    catalog,
    { "claude-opus-4-6-thinking": "anthropic/claude-opus-4-6" }
  );

  assert.equal(match?.metadataId, "anthropic/claude-opus-4-6");
  assert.equal(match?.method, "alias");
});

test("matches by owner prefix when the owner is canonical", () => {
  const match = findMetadataMatch({ id: "gpt-5.5", owned_by: "openai" }, catalog, {});

  assert.equal(match?.metadataId, "openai/gpt-5.5");
  assert.equal(match?.method, "owner-prefix");
});

test("matches by exact suffix for router-owned models", () => {
  const match = findMetadataMatch({ id: "deepseek-v4-flash", owned_by: "feedmob-litellm" }, catalog, {});

  assert.equal(match?.metadataId, "deepseek/deepseek-v4-flash");
  assert.equal(match?.method, "suffix");
});

test("matches by normalized suffix when capitalization differs", () => {
  const match = findMetadataMatch({ id: "minimax-m2.7", owned_by: "feedmob-litellm" }, catalog, {});

  assert.equal(match?.metadataId, "minimax/MiniMax-M2.7");
  assert.equal(match?.method, "normalized-suffix");
});

test("matches prefixed IDs by leaf suffix", () => {
  const match = findMetadataMatch(
    { id: "nous-portal-free/tencent/hy3:free", owned_by: "feedmob-litellm" },
    {
      ...catalog,
      "tencent/hy3": { id: "tencent/hy3", name: "Hy3" },
    },
    {}
  );

  assert.equal(match?.metadataId, "tencent/hy3");
  assert.equal(match?.method, "suffix");
});

test("matches multi-segment models.dev IDs through custom prefixes", () => {
  const match = findMetadataMatch(
    { id: "my-proxy/nvidia/nemotron-3-ultra-550b-a55b:free", owned_by: "feedmob-litellm" },
    {
      ...catalog,
      "nvidia/nemotron-3-ultra-550b-a55b": { id: "nvidia/nemotron-3-ultra-550b-a55b", name: "Nemotron 3 Ultra" },
    },
    {}
  );

  assert.equal(match?.metadataId, "nvidia/nemotron-3-ultra-550b-a55b");
  assert.equal(match?.method, "suffix");
});

test("matches prefixed IDs by normalized base leaf", () => {
  const match = findMetadataMatch(
    { id: "nous-portal-free/tencent/Hy3:free", owned_by: "feedmob-litellm" },
    {
      ...catalog,
      "tencent/hy3": { id: "tencent/hy3", name: "Hy3" },
    },
    {}
  );

  assert.equal(match?.metadataId, "tencent/hy3");
  assert.equal(match?.method, "normalized-suffix");
});

test("does not match ambiguous custom prefixes", () => {
  const ambiguous = {
    ...catalog,
    "tencent/hy3": { id: "tencent/hy3", name: "Hy3" },
    "other/hy3": { id: "other/hy3", name: "Other Hy3" },
  };

  assert.equal(
    findMetadataMatch({ id: "hy3:free", owned_by: "feedmob-litellm" }, ambiguous, {}),
    undefined
  );
});

test("uses a canonical owner to resolve otherwise ambiguous model IDs", () => {
  const ambiguous = {
    ...catalog,
    "other/gpt-5.5": { id: "other/gpt-5.5", name: "Other GPT-5.5" }
  };

  assert.equal(findMetadataMatch({ id: "gpt-5.5", owned_by: "router" }, ambiguous, {}), undefined);
  const match = findMetadataMatch({ id: "gpt-5.5", owned_by: "openai" }, ambiguous, {});
  assert.equal(match?.metadataId, "openai/gpt-5.5");
  assert.equal(match?.method, "owner-prefix");
  assert.equal(findMetadataMatch({ id: "unknown-model", owned_by: "router" }, catalog, {}), undefined);
});

test("allows an explicit alias to override a canonical owner match", () => {
  const ambiguous = {
    ...catalog,
    "other/gpt-5.5": { id: "other/gpt-5.5", name: "Other GPT-5.5" }
  };

  const match = findMetadataMatch(
    { id: "gpt-5.5", owned_by: "openai" },
    ambiguous,
    { "gpt-5.5": "other/gpt-5.5" },
  );

  assert.equal(match?.metadataId, "other/gpt-5.5");
  assert.equal(match?.method, "alias");
});
