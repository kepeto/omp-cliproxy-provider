import { globalConfigPath, readConfigFile, type ConfigLayer } from "./config.ts";

/**
 * GPT-5.6 context-window mode.
 *
 * OMP has no pi-style namespaced `settings.json` (`~/.pi/agent/settings.json`
 * is migrated to `config.yml` at startup, and its schema cannot carry unknown
 * namespaces). The port therefore keeps this setting in the extension's own
 * global config file (`~/.omp/agent/pi-cliproxyapi-provider/config.json`,
 * field `gpt56ContextWindow`). The project config file is restricted to
 * `modelAliases`; this setting is global-only.
 */
export type Gpt56ContextWindowMode = "canonical" | "full";

export interface ProviderSettings {
  gpt56ContextWindow: Gpt56ContextWindowMode;
}

export const DEFAULT_PROVIDER_SETTINGS: ProviderSettings = {
  gpt56ContextWindow: "canonical",
};

function parseSettingsLayer(config: ConfigLayer | undefined, scope: string): Partial<ProviderSettings> {
  if (!config) return {};
  const value = (config as Record<string, unknown>).gpt56ContextWindow;
  if (value === undefined) return {};
  if (value !== "canonical" && value !== "full") {
    throw new Error(`gpt56ContextWindow must be "canonical" or "full" in ${scope}`);
  }
  return { gpt56ContextWindow: value };
}

export function loadProviderSettings(): ProviderSettings {
  return {
    ...DEFAULT_PROVIDER_SETTINGS,
    ...parseSettingsLayer(readConfigFile(globalConfigPath()), "global config"),
  };
}