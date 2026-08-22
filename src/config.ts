import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { getAgentDir } from "./host.ts";
import type { CpaProviderConfig } from "./types.ts";

export type ConfigLayer = Partial<CpaProviderConfig>;

export const DEFAULT_CONFIG: CpaProviderConfig = {
  providerName: "cpa",
  baseUrl: "http://localhost:8317/v1",
  authRequired: true,
  authHeader: true,
  headers: {},
  modelsDevEnabled: true,
  modelAliases: {},
};

/**
 * Global config: `~/.omp/agent/pi-cliproxyapi-provider/config.json`.
 * OMP's agent config dir (`getAgentDir()`, honoring OMP_PROFILE) replaces the
 * pi `~/.pi/agent` root; the provider keeps its own file to avoid the
 * `config.yml` schema, exactly as it kept `~/.pi/agent/.../config.json`.
 */
export function globalConfigPath(): string {
  return join(getAgentDir(), "pi-cliproxyapi-provider", "config.json");
}

/**
 * Project config layers: `<cwd>/<dir>/pi-cliproxyapi-provider/config.json`
 * (project-level `modelAliases` only). Dual-runtime: with `PI_CONFIG_DIR`
 * set, only that directory is read; otherwise both `.omp` and `.pi` are
 * merged (`.pi` wins). Project config is read-only — writes go to the
 * global config.
 */
export function readProjectConfigLayers(cwd: string, env: NodeJS.ProcessEnv = process.env): ConfigLayer {
  const pinned = env.PI_CONFIG_DIR?.trim();
  const dirs = pinned ? [pinned] : [".omp", ".pi"];
  const layers = dirs
    .map((dir) => readConfigFile(join(cwd, dir, "pi-cliproxyapi-provider", "config.json")))
    .filter((layer): layer is ConfigLayer => layer !== undefined);
  const merged = Object.assign({}, ...layers);
  if (layers.some((layer) => layer.modelAliases)) {
    // ponytail: Object.assign is shallow — merge alias maps explicitly.
    merged.modelAliases = Object.assign({}, ...layers.map((layer) => layer.modelAliases));
  }
  return merged;
}

export function cacheDir(): string {
  return join(homedir(), ".cache", "pi-cliproxyapi-provider");
}

export function providerCacheKey(config: Pick<CpaProviderConfig, "providerName" | "baseUrl">): string {
  return Buffer.from(`${config.providerName}\n${config.baseUrl}`).toString("base64url");
}

export function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function normalizeConfig(config: CpaProviderConfig): CpaProviderConfig {
  return {
    ...config,
    authHeader: config.authRequired ? config.authHeader : false,
  };
}

function safeProjectConfig(projectConfig?: ConfigLayer): ConfigLayer | undefined {
  if (!projectConfig) return undefined;
  return {
    ...(projectConfig.modelAliases !== undefined ? { modelAliases: projectConfig.modelAliases } : {}),
  };
}

function projectConfigLayer(value: unknown, path: string): ConfigLayer {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Project config file must contain a JSON object: ${path}`);
  }

  const record = value as Record<string, unknown>;
  if (record.modelAliases !== undefined && !isStringMap(record.modelAliases)) {
    throw new Error(`modelAliases must be an object with string values in project config file: ${path}`);
  }

  return safeProjectConfig(record as ConfigLayer) ?? {};
}

function mergeLayer(base: CpaProviderConfig, layer?: ConfigLayer): CpaProviderConfig {
  if (!layer) return base;
  return {
    ...base,
    ...layer,
    headers: { ...base.headers, ...(layer.headers ?? {}) },
    modelAliases: { ...base.modelAliases, ...(layer.modelAliases ?? {}) },
  };
}

function envLayer(env: NodeJS.ProcessEnv): ConfigLayer {
  const authRequired = parseBooleanEnv(env.CLIPROXYAPI_AUTH_REQUIRED);
  const authHeader = parseBooleanEnv(env.CLIPROXYAPI_AUTH_HEADER);
  const modelsDevEnabled = parseBooleanEnv(env.CLIPROXYAPI_MODELS_DEV_ENABLED);
  return {
    ...(env.CLIPROXYAPI_BASE_URL ? { baseUrl: env.CLIPROXYAPI_BASE_URL } : {}),
    ...(env.CLIPROXYAPI_PROVIDER_NAME ? { providerName: env.CLIPROXYAPI_PROVIDER_NAME } : {}),
    ...(authRequired !== undefined ? { authRequired } : {}),
    ...(authHeader !== undefined ? { authHeader } : {}),
    ...(modelsDevEnabled !== undefined ? { modelsDevEnabled } : {}),
  };
}

export function mergeConfigLayers(
  globalConfig?: ConfigLayer,
  projectConfig?: ConfigLayer,
  env: NodeJS.ProcessEnv = process.env,
): CpaProviderConfig {
  const envConfig = envLayer(env);
  return normalizeConfig(mergeLayer(mergeLayer(mergeLayer(DEFAULT_CONFIG, globalConfig), safeProjectConfig(projectConfig)), envConfig));
}

function isStringMap(value: unknown): value is Record<string, string> {
  return !!value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.values(value).every((entry) => typeof entry === "string");
}

function validateConfigLayer(value: unknown, path: string): ConfigLayer {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Config file must contain a JSON object: ${path}`);
  }

  const record = value as Record<string, unknown>;
  const stringFields = ["providerName", "baseUrl"];
  for (const field of stringFields) {
    if (record[field] !== undefined && typeof record[field] !== "string") {
      throw new Error(`${field} must be a string in config file: ${path}`);
    }
  }

  const booleanFields = ["authRequired", "authHeader", "modelsDevEnabled"];
  for (const field of booleanFields) {
    if (record[field] !== undefined && typeof record[field] !== "boolean") {
      throw new Error(`${field} must be a boolean in config file: ${path}`);
    }
  }

  if (record.headers !== undefined && !isStringMap(record.headers)) {
    throw new Error(`headers must be an object with string values in config file: ${path}`);
  }
  if (record.modelAliases !== undefined && !isStringMap(record.modelAliases)) {
    throw new Error(`modelAliases must be an object with string values in config file: ${path}`);
  }

  if (record.gpt56ContextWindow !== undefined && record.gpt56ContextWindow !== "canonical" && record.gpt56ContextWindow !== "full") {
    throw new Error(`gpt56ContextWindow must be "canonical" or "full" in config file: ${path}`);
  }

  return record as ConfigLayer;
}

export function readConfigFile(path: string): ConfigLayer | undefined {
  if (!existsSync(path)) return undefined;
  return validateConfigLayer(JSON.parse(readFileSync(path, "utf8")), path);
}

export function readProjectConfigFile(path: string): ConfigLayer | undefined {
  if (!existsSync(path)) return undefined;
  return projectConfigLayer(JSON.parse(readFileSync(path, "utf8")), path);
}

export function loadConfig(cwd: string, env: NodeJS.ProcessEnv = process.env): CpaProviderConfig {
  return mergeConfigLayers(readConfigFile(globalConfigPath()), readProjectConfigLayers(cwd, env), env);
}

export function writeConfigFile(path: string, config: ConfigLayer): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}