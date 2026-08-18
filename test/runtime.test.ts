import test from "node:test";
import assert from "node:assert/strict";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { ProviderRuntime } from "../src/runtime.ts";
import type { ProviderCatalog, CatalogRefreshResult, CatalogSnapshot } from "../src/catalog.ts";
import type { CpaProviderConfig, InputModality } from "../src/types.ts";
import type { ProviderModelConfigLike } from "../src/types.ts";

const config: CpaProviderConfig = {
  providerName: "cpa",
  baseUrl: "http://localhost:8317/v1",
  authRequired: false,
  authHeader: false,
  headers: {},
  modelsDevEnabled: true,
  modelAliases: {},
};

interface RegisteredModel {
  id: string;
  reasoning: boolean;
  compat: { supportsStrictMode: boolean };
}

function snapshot(id: string, reasoning = false): CatalogSnapshot {
  const models: ProviderModelConfigLike[] = id ? [{
    id,
    name: id,
    reasoning,
    input: ["text"] as InputModality[],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 16384,
  }] : [];
  const matchMethods: Record<string, number> = {};
  return {
    cpaModels: [],
    metadata: {},
    metadataSource: "bundled",
    gpt56ContextWindow: "canonical",
    built: {
      models,
      stats: { total: models.length, enriched: 0, unmatched: models.length, matchMethods, unmatchedModelIds: models.map((model) => model.id) },
    },
  };
}

function refreshResult(snapshotValue: CatalogSnapshot, modelsChanged = true): CatalogRefreshResult {
  return {
    snapshot: snapshotValue,
    models: { attempted: true, updated: true, changed: modelsChanged },
    metadata: { attempted: false, updated: false, changed: false },
  };
}

// Structural test doubles: the runtime contract needs `load` / `refresh` and a
// `registerProvider` side channel; unchecked casts are confined to this mock
// boundary and are not part of the runtime's own typing.
function asCatalog(mock: { load(): Promise<CatalogSnapshot>; refresh(...args: unknown[]): Promise<CatalogRefreshResult> }): ProviderCatalog {
  return mock as unknown as ProviderCatalog;
}

function asPi(registerProvider: (name: string, provider: unknown) => void): ExtensionAPI {
  return { registerProvider } as unknown as ExtensionAPI;
}

test("runtime registers cached models immediately and refreshes without reload", async () => {
  const registrations: Array<{ name: string; provider: { models: RegisteredModel[] } }> = [];
  const catalog = asCatalog({
    load: async () => snapshot("cached"),
    refresh: async () => refreshResult(snapshot("fresh", true)),
  });
  const runtime = new ProviderRuntime({
    pi: asPi((name: string, provider: unknown) => registrations.push({ name, provider: provider as { models: RegisteredModel[] } })),
    config,
    catalog,
  });

  await runtime.start();
  await runtime.refresh("models", "background");

  assert.equal(registrations.length, 2);
  assert.equal(registrations[0].provider.models[0].id, "cached");
  assert.equal(registrations[0].provider.models[0].compat.supportsStrictMode, false);
  assert.equal(registrations[1].provider.models[0].id, "fresh");
  assert.equal(registrations[1].provider.models[0].reasoning, true);
  assert.equal(registrations[1].provider.models[0].compat.supportsStrictMode, false);
});

test("runtime refresh forwards target and mode to the catalog", async () => {
  let receivedTarget: string | undefined;
  let receivedMode: string | undefined;
  const catalog = asCatalog({
    load: async () => snapshot("cached"),
    refresh: async (target: string, mode: string) => {
      receivedTarget = target;
      receivedMode = mode;
      return refreshResult(snapshot("manual-fresh"));
    },
  });
  const runtime = new ProviderRuntime({
    pi: asPi(() => {}),
    config,
    catalog,
  });

  await runtime.start();
  await runtime.refresh("models", "manual");

  assert.equal(receivedTarget, "models");
  assert.equal(receivedMode, "manual");
});

test("runtime skips re-registration when the snapshot fingerprint is unchanged", async () => {
  let registrations = 0;
  const catalog = asCatalog({
    load: async () => snapshot("cached"),
    refresh: async () => refreshResult(snapshot("cached"), false),
  });
  const runtime = new ProviderRuntime({
    pi: asPi(() => { registrations += 1; }),
    config,
    catalog,
  });

  await runtime.start();
  await runtime.refresh("all", "background");

  assert.equal(registrations, 1);
});

test("runtime registers the unavailable fallback after an empty network refresh", async () => {
  const registrations: Array<{ name: string; provider: { models: RegisteredModel[] } }> = [];
  const catalog = asCatalog({
    load: async () => snapshot("cached"),
    refresh: async () => refreshResult(snapshot("")),
  });
  const runtime = new ProviderRuntime({
    pi: asPi((name: string, provider: unknown) => registrations.push({ name, provider: provider as { models: RegisteredModel[] } })),
    config,
    catalog,
  });

  await runtime.start();
  await runtime.refresh("models", "background");

  const last = registrations.at(-1);
  assert.equal(last?.provider.models[0].id, "login-required");
  assert.equal(last?.provider.models[0].compat.supportsStrictMode, false);
});

test("runtime refresh forwards the discovery API-key provider", async () => {
  let receivedApiKey: string | undefined;
  const catalog = asCatalog({
    load: async () => snapshot("cached"),
    refresh: async (_target: string, _mode: string, getApiKey?: () => Promise<string | undefined>) => {
      receivedApiKey = await getApiKey?.();
      return refreshResult(snapshot("credential-fresh"));
    },
  });
  const runtime = new ProviderRuntime({
    pi: asPi(() => {}),
    config,
    catalog,
  });

  await runtime.start();
  await runtime.refresh("models", "manual", async () => "runtime-key");

  assert.equal(receivedApiKey, "runtime-key");
});