import type { ProviderConfig, ProviderModelConfig } from "@oh-my-pi/pi-coding-agent";
import type { CpaProviderConfig, ProviderModelConfigLike } from "./types.ts";

export interface ProviderRegistration {
  providerName: string;
  config: ProviderConfig;
}

/**
 * OMP's ProviderConfig has no `name` or `refreshModels`: the provider name is
 * the registry key, and model refresh is driven by the extension (background
 * after startup, manual via /cliproxyapi refresh). Production replaces the
 * pi `$CLIPROXYAPI_API_KEY` marker with the bare env-var name:
 * `apiKey: "CLIPROXYAPI_API_KEY"` + `authHeader` resolves the env var live
 * per request (env first, literal fallback), which reproduces pi's
 * `$CLIPROXYAPI_API_KEY` registration behavior under OMP.
 */
export function normalizeProviderModels(models: ProviderModelConfigLike[]): ProviderModelConfig[] {
  return models.map((model) => ({
    ...model,
    // CLIProxyAPI accepts OpenAI-compatible function tools for both Chat
    // Completions and Responses models, but OMP's strict all-properties-required
    // rewrite destroys optional argument semantics for multi-mode extension
    // tools. Keep each model's API selection and disable only that rewrite.
    compat: {
      ...model.compat,
      supportsStrictMode: false,
    },
  })) as ProviderModelConfig[];
}

export function buildProviderRegistration(
  config: CpaProviderConfig,
  models: ProviderModelConfigLike[],
): ProviderRegistration {
  return {
    providerName: config.providerName,
    config: {
      baseUrl: config.baseUrl,
      api: "openai-completions",
      apiKey: config.authRequired ? "CLIPROXYAPI_API_KEY" : "cliproxyapi-no-auth",
      authHeader: config.authRequired && config.authHeader,
      headers: Object.keys(config.headers).length > 0 ? config.headers : undefined,
      models: normalizeProviderModels(models),
    },
  };
}