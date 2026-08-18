import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { setAgentDir } from "@oh-my-pi/pi-utils";
import extension from "../extensions/index.ts";

interface RegisteredProvider {
  models: Array<{ id: string; contextWindow?: number; compat?: { supportsStrictMode?: boolean } }>;
}

interface FakeExtensionAPI {
  providers: Map<string, RegisteredProvider>;
  commandHandler?: (args: string, ctx: unknown) => Promise<void>;
  notifications: Array<{ message: string; level: string }>;
}

function fakePi(): FakeExtensionAPI {
  const api: FakeExtensionAPI = {
    providers: new Map<string, RegisteredProvider>(),
    notifications: [],
  };
  return api;
}

async function withTempCwd<T>(fn: (cwd: string) => Promise<T>): Promise<T> {
  const cwd = await mkdtemp(join(tmpdir(), "pi-cpa-extension-"));
  const originalCwd = process.cwd();
  try {
    process.chdir(cwd);
    return await fn(cwd);
  } finally {
    process.chdir(originalCwd);
    await rm(cwd, { recursive: true, force: true });
  }
}

interface RegistrationGate {
  promise: Promise<RegisteredProvider>;
  register: (name: string, config: unknown) => void;
}

/**
 * Gate on the live registration signal: `runtime.register()` calls
 * `pi.registerProvider` synchronously the moment a new fingerprint is ready,
 * so awaiting the gate awaits the actual registration — no wall-clock polling.
 */
function registrationGate(wantedModelId: string): RegistrationGate {
  const { promise, resolve } = Promise.withResolvers<RegisteredProvider>();
  return {
    promise,
    register: (_name: string, config: unknown) => {
      const provider = config as RegisteredProvider;
      if (provider.models[0]?.id === wantedModelId) resolve(provider);
    },
  };
}

async function runExtension(
  api: FakeExtensionAPI,
  gate: RegistrationGate | undefined,
  fetchImpl?: typeof fetch,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  try {
    if (fetchImpl) globalThis.fetch = fetchImpl;
    await extension({
      registerCommand: (_name: string, options: { handler: (args: string, ctx: unknown) => Promise<void> }) => { api.commandHandler = options.handler; },
      registerProvider: (name: string, config: unknown) => {
        api.providers.set(name, config as RegisteredProvider);
        gate?.register(name, config);
      },
      on: () => {},
    } as unknown as ExtensionAPI);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("extension registers the cached snapshot immediately and refreshes in the background", async () => {
  const home = await mkdtemp(join(tmpdir(), "pi-cpa-extension-lifecycle-home-"));
  const originalHome = process.env.HOME;

  try {
    process.env.HOME = home;
    setAgentDir(join(home, ".omp", "agent"));
    const api = fakePi();
    await withTempCwd(async () => {
      const gate = registrationGate("fresh-model");
      await runExtension(api, gate, (async (url: string | URL | Request) => {
        assert.equal(String(url), "http://localhost:8317/v1/models");
        return new Response(JSON.stringify({ data: [{ id: "fresh-model" }] }), { status: 200 });
      }) as typeof fetch);

      // Startup registration carries the unavailable placeholder; the
      // post-load background refresh re-registers with discovered models.
      assert.equal(api.providers.get("cpa")?.models[0].id, "login-required");
      assert.equal(api.providers.get("cpa")?.models[0].compat?.supportsStrictMode, false);

      const refreshed = await gate.promise;
      assert.equal(refreshed.models[0].id, "fresh-model");
      assert.equal(refreshed.models[0].compat?.supportsStrictMode, false);
    });
  } finally {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    await rm(home, { recursive: true, force: true });
  }
});

test("extension applies the full GPT-5.6 context window from the global provider config", async () => {
  const home = await mkdtemp(join(tmpdir(), "pi-cpa-extension-settings-home-"));
  const originalHome = process.env.HOME;

  try {
    process.env.HOME = home;
    setAgentDir(join(home, ".omp", "agent"));
    const agentDir = join(home, ".omp", "agent", "pi-cliproxyapi-provider");
    await mkdir(agentDir, { recursive: true });
    await writeFile(join(agentDir, "config.json"), JSON.stringify({
      gpt56ContextWindow: "full",
    }));

    const api = fakePi();
    await withTempCwd(async () => {
      const gate = registrationGate("gpt-5.6-sol");
      await runExtension(api, gate, (async () => new Response(JSON.stringify({
        data: [{ id: "gpt-5.6-sol", owned_by: "openai" }],
      }), { status: 200 })) as typeof fetch);

      const provider = await gate.promise;
      const model = provider.models.find((entry) => entry.id === "gpt-5.6-sol");
      assert.equal(model?.contextWindow, 1050000);
    });
  } finally {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    await rm(home, { recursive: true, force: true });
  }
});

test("manual refresh uses the active model registry credential", async () => {
  const home = await mkdtemp(join(tmpdir(), "pi-cpa-extension-refresh-home-"));
  const originalHome = process.env.HOME;

  try {
    process.env.HOME = home;
    setAgentDir(join(home, ".omp", "agent"));
    await withTempCwd(async (cwd) => {
      const api = fakePi();
      let receivedAuthorization: string | null = null;
      await runExtension(api, undefined, (async (_url: string | URL | Request, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        receivedAuthorization = headers.get("Authorization");
        if (receivedAuthorization !== "Bearer runtime-key") {
          return new Response("unauthorized", { status: 401, statusText: "Unauthorized" });
        }
        return new Response(JSON.stringify({ data: [{ id: "fresh-model" }] }), { status: 200 });
      }) as typeof fetch);

      await api.commandHandler?.("refresh models", {
        cwd,
        modelRegistry: {
          getApiKeyForProvider: async (providerName: string) => {
            assert.equal(providerName, "cpa");
            return "runtime-key";
          },
        },
        ui: {
          notify: (message: string, level: string) => api.notifications.push({ message, level }),
        },
      });

      assert.equal(receivedAuthorization, "Bearer runtime-key");
      assert.equal(api.notifications.at(-1)?.level, "info");
      assert.doesNotMatch(api.notifications.at(-1)?.message ?? "", /401 Unauthorized/);
    });
  } finally {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    await rm(home, { recursive: true, force: true });
  }
});

test("extension registers placeholder provider when global config is invalid", async () => {
  const home = await mkdtemp(join(tmpdir(), "pi-cpa-extension-home-"));
  const originalHome = process.env.HOME;

  try {
    process.env.HOME = home;
    await withTempCwd(async () => {
      const configDir = join(home, ".omp", "agent", "pi-cliproxyapi-provider");
      await mkdir(configDir, { recursive: true });
      await writeFile(join(configDir, "config.json"), JSON.stringify({ headers: null }));

      const api = fakePi();
      await runExtension(api, undefined);

      const provider = api.providers.get("cpa");
      assert.equal(provider?.models[0].id, "login-required");
      assert.equal(provider?.models[0].compat?.supportsStrictMode, false);
    });
  } finally {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    await rm(home, { recursive: true, force: true });
  }
});