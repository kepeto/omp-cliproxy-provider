import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setAgentDir } from "@oh-my-pi/pi-utils";
import { DEFAULT_PROVIDER_SETTINGS, loadProviderSettings } from "../src/settings.ts";

async function withSettingsTree<T>(fn: (agentDir: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "pi-cpa-settings-"));
  const originalHome = process.env.HOME;
  try {
    process.env.HOME = root;
    const agentDir = join(root, ".omp", "agent");
    await mkdir(agentDir, { recursive: true });
    // The dirs resolver freezes at module load; pin it to the temp tree.
    setAgentDir(agentDir);
    return await fn(agentDir);
  } finally {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    await rm(root, { recursive: true, force: true });
  }
}

const globalConfigPath = (agentDir: string): string =>
  join(agentDir, "pi-cliproxyapi-provider", "config.json");

test("uses the canonical GPT-5.6 context window by default", async () => {
  await withSettingsTree(async (agentDir) => {
    assert.deepEqual(loadProviderSettings(), DEFAULT_PROVIDER_SETTINGS);
  });
});

test("global provider config sets the GPT-5.6 context window mode", async () => {
  await withSettingsTree(async (agentDir) => {
    await writeFile(globalConfigPath(agentDir), JSON.stringify({
      gpt56ContextWindow: "full",
    }));

    assert.equal(loadProviderSettings().gpt56ContextWindow, "full");
  });
});

test("project config cannot override the GPT-5.6 context window mode", async () => {
  await withSettingsTree(async (agentDir) => {
    const projectConfigDir = join(process.cwd(), ".omp", "pi-cliproxyapi-provider");
    await mkdir(projectConfigDir, { recursive: true });
    await writeFile(join(projectConfigDir, "config.json"), JSON.stringify({
      gpt56ContextWindow: "full",
    }));

    // The setting is global-only; the project file's field is ignored.
    assert.equal(loadProviderSettings().gpt56ContextWindow, "canonical");
  });
});

test("rejects unsupported GPT-5.6 context window modes", async () => {
  await withSettingsTree(async (agentDir) => {
    await writeFile(globalConfigPath(agentDir), JSON.stringify({
      gpt56ContextWindow: "unbounded",
    }));

    assert.throws(
      () => loadProviderSettings(),
      /gpt56ContextWindow must be "canonical" or "full"/,
    );
  });
});
