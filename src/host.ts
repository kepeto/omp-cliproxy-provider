/**
 * Dual-runtime host shim: resolves the coding-agent host package from
 * whichever runtime loads this plugin — OMP (`@oh-my-pi/*`) or pi.dev
 * (`@earendil-works/*`). All other framework imports are type-only
 * (erased at runtime), so this file is the sole runtime coupling.
 */

interface HostModule {
  getAgentDir: () => string;
}

async function resolveHost(): Promise<HostModule> {
  // ponytail: specifier kept in a variable so tsc doesn't demand both
  // packages be installed — only one host exists per runtime.
  for (const specifier of ["@oh-my-pi/pi-coding-agent", "@earendil-works/pi-coding-agent"] as const) {
    try {
      return (await import(specifier)) as HostModule;
    } catch {
      // host not installed; try the next one
    }
  }
  throw new Error(
    "omp-cliproxy-provider requires a host runtime: OMP (@oh-my-pi/pi-coding-agent) or pi.dev (@earendil-works/pi-coding-agent)",
  );
}

export const getAgentDir: HostModule["getAgentDir"] = (await resolveHost()).getAgentDir;

/**
 * Reasoning-effort levels. Identical wire strings on both hosts
 * (`Effort.Minimal === "minimal"` etc.), so a local const avoids a
 * hard dependency on either `pi-ai` package.
 */
export const Effort = {
  Minimal: "minimal",
  Low: "low",
  Medium: "medium",
  High: "high",
  XHigh: "xhigh",
  Max: "max",
} as const;
