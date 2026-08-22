import type { Effort as EffortLevel } from "@oh-my-pi/pi-ai";
import type { ProviderModelConfig } from "@oh-my-pi/pi-coding-agent";
import { Effort } from "./host.ts";

export interface ModelCapabilityContext {
  availableModelId: string;
  metadataModelId?: string;
}

export interface ModelCapabilityOverrides {
  reasoning?: boolean;
  thinking?: NonNullable<ProviderModelConfig["thinking"]>;
}

interface ModelCapabilityRule {
  matches: (context: ModelCapabilityContext) => boolean;
  overrides: ModelCapabilityOverrides;
}

/**
 * GPT-5.6 exposes a controllable effort surface. OMP encodes per-model
 * thinking capability as `thinking: { mode: "effort", efforts: [...] }`
 * (the catalog `ThinkingConfig`); pi's `thinkingLevelMap` has no OMP
 * equivalent and would be silently dropped by the overlay builder.
 *
 * The effort list covers every OMP `Effort` level — including `minimal`,
 * which the OMP canonical catalog entry omits but the OpenAI Responses wire
 * type accepts. OMP's `off` thinking level is handled by the runner
 * (`forceReasoningOff`), which reproduces pi's `off: "none"` mapping; the
 * other levels map to the identical wire values by identity.
 */
export const GPT_5_6_THINKING: NonNullable<ProviderModelConfig["thinking"]> = {
  mode: "effort",
  efforts: [
    Effort.Minimal,
    Effort.Low,
    Effort.Medium,
    Effort.High,
    Effort.XHigh,
    Effort.Max,
  ] as readonly EffortLevel[],
};

function includesModelFamily(context: ModelCapabilityContext, family: string): boolean {
  return [context.availableModelId, context.metadataModelId]
    .filter((id): id is string => id !== undefined)
    .some((id) => id.includes(family));
}

const MODEL_CAPABILITY_RULES: readonly ModelCapabilityRule[] = [
  {
    matches: (context) => includesModelFamily(context, "gpt-5.6"),
    overrides: {
      reasoning: true,
      thinking: GPT_5_6_THINKING,
    },
  },
];

export function getModelCapabilityOverrides(context: ModelCapabilityContext): ModelCapabilityOverrides {
  const resolved: ModelCapabilityOverrides = {};

  for (const rule of MODEL_CAPABILITY_RULES) {
    if (!rule.matches(context)) continue;
    if (rule.overrides.reasoning !== undefined) resolved.reasoning = rule.overrides.reasoning;
    if (rule.overrides.thinking) resolved.thinking = rule.overrides.thinking;
  }

  return resolved;
}