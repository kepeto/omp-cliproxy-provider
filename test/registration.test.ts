import test from "node:test";
import assert from "node:assert/strict";
import { buildProviderRegistration } from "../src/registration.ts";
import { readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";

function authPaths() {
  return [
    `${process.env.HOME}/.pi/agent/auth.json`,
    `${process.env.HOME}/.omp/agent/auth.json`,
  ];
}

test("uses environment API key placeholder when auth is required", () => {
  const backups = new Map<string, string>();
  for (const path of authPaths()) {
    try {
      backups.set(path, readFileSync(path, "utf8"));
      renameSync(path, `${path}.bak`);
    } catch {
      try { unlinkSync(path); } catch {}
    }
  }
  try {
    const registration = buildProviderRegistration({
      providerName: "cpa",
      baseUrl: "http://localhost:8317/v1",
      authRequired: true,
      authHeader: true,
      headers: { "User-Agent": "pi" },
      modelsDevEnabled: true,
      modelAliases: {},
    }, []);

    assert.equal(registration.providerName, "cpa");
    assert.equal(registration.config.apiKey, "CLIPROXYAPI_API_KEY");
    assert.equal(registration.config.authHeader, true);
    assert.equal(registration.config.oauth, undefined);
  } finally {
    for (const path of authPaths()) {
      const backup = `${path}.bak`;
      try { renameSync(backup, path); } catch {
        const content = backups.get(path);
        if (content !== undefined) writeFileSync(path, content);
      }
    }
  }
});

test("uses nonempty placeholder API key for no-auth mode", () => {
  const registration = buildProviderRegistration({
    providerName: "cpa",
    baseUrl: "http://localhost:8317/v1",
    authRequired: false,
    authHeader: false,
    headers: {},
    modelsDevEnabled: true,
    modelAliases: {},
  }, []);

  assert.equal(registration.config.apiKey, "cliproxyapi-no-auth");
  assert.equal(registration.config.authHeader, false);
});

test("forces Authorization header off when auth is disabled", () => {
  const registration = buildProviderRegistration({
    providerName: "cpa",
    baseUrl: "http://localhost:8317/v1",
    authRequired: false,
    authHeader: true,
    headers: {},
    modelsDevEnabled: true,
    modelAliases: {},
  }, []);

  assert.equal(registration.config.apiKey, "cliproxyapi-no-auth");
  assert.equal(registration.config.authHeader, false);
});
