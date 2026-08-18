import type { CpaModel } from "./cpa.ts";
import type { ModelsDevCatalog, ModelsDevMetadata } from "./types.ts";

const CANONICAL_OWNER_PREFIXES: Record<string, string> = {
  openai: "openai",
  anthropic: "anthropic",
  google: "google",
  deepseek: "deepseek",
  mistral: "mistral",
  xai: "xai",
  zhipuai: "zhipuai",
  alibaba: "alibaba",
  moonshotai: "moonshotai",
  minimax: "minimax",
  nvidia: "nvidia",
  cohere: "cohere",
};

export type MetadataMatchMethod = "alias" | "exact" | "owner-prefix" | "suffix" | "normalized-suffix";

export interface MetadataMatch {
  metadataId: string;
  metadata: ModelsDevMetadata;
  method: MetadataMatchMethod;
}

export function normalizeModelName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function oneMatch(candidates: string[]): string | undefined {
  const unique = [...new Set(candidates)];
  return unique.length === 1 ? unique[0] : undefined;
}

function segmentSuffixMatch(cpaModelId: string, catalogKey: string, stripLastSuffix = false): boolean {
  const cpaId = stripLastSuffix ? cpaModelId.replace(/:[a-z0-9]+$/i, "") : cpaModelId;
  const cpaSegments = cpaId.split("/");
  const catalogSegments = catalogKey.split("/");

  if (cpaSegments.length < catalogSegments.length) {
    return catalogKey.endsWith(`/${cpaId}`);
  }

  const cpaSuffix = cpaSegments.slice(-catalogSegments.length);

  for (let i = 0; i < catalogSegments.length; i++) {
    if (cpaSuffix[i] !== catalogSegments[i]) return false;
  }

  return true;
}

export function findMetadataMatch(
  cpaModel: Pick<CpaModel, "id" | "owned_by">,
  catalog: ModelsDevCatalog,
  aliases: Record<string, string>,
): MetadataMatch | undefined {
  const alias = aliases[cpaModel.id];
  if (alias && catalog[alias]) {
    return { metadataId: alias, metadata: catalog[alias], method: "alias" };
  }

  if (catalog[cpaModel.id]) {
    return { metadataId: cpaModel.id, metadata: catalog[cpaModel.id], method: "exact" };
  }

  const owner = cpaModel.owned_by?.trim().toLowerCase();
  const canonicalOwner = owner ? CANONICAL_OWNER_PREFIXES[owner] : undefined;
  if (canonicalOwner) {
    const ownerKey = `${canonicalOwner}/${cpaModel.id}`;
    if (catalog[ownerKey]) {
      return { metadataId: ownerKey, metadata: catalog[ownerKey], method: "owner-prefix" };
    }
  }

  const segments = cpaModel.id.split("/");
  const leaf = segments.at(-1) ?? cpaModel.id;
  const leafBase = leaf.replace(/:[a-z0-9]+$/i, "");
  const normalizedId = normalizeModelName(cpaModel.id.replace(/:[a-z0-9]+$/i, ""));
  const normalizedLeaf = normalizeModelName(leaf);
  const normalizedLeafBase = normalizeModelName(leafBase);

  const exactSuffixCandidates: string[] = [];
  const segmentSuffixCandidates: string[] = [];
  const normalizedSuffixCandidates: string[] = [];
  const leafSuffixCandidates: string[] = [];
  const leafBaseSuffixCandidates: string[] = [];
  const normalizedLeafSuffixCandidates: string[] = [];
  const normalizedLeafBaseSuffixCandidates: string[] = [];

  for (const key of Object.keys(catalog)) {
    if (key.endsWith(`/${cpaModel.id}`)) {
      exactSuffixCandidates.push(key);
    }
    if (segmentSuffixMatch(cpaModel.id, key, true)) {
      segmentSuffixCandidates.push(key);
    }
    if (normalizeModelName(key.split("/").at(-1) ?? key) === normalizedId) {
      normalizedSuffixCandidates.push(key);
    }
    if (key.endsWith(`/${leaf}`)) {
      leafSuffixCandidates.push(key);
    }
    if (key.endsWith(`/${leafBase}`)) {
      leafBaseSuffixCandidates.push(key);
    }
    if (normalizeModelName(key.split("/").at(-1) ?? key) === normalizedLeaf) {
      normalizedLeafSuffixCandidates.push(key);
    }
    if (normalizeModelName(key.split("/").at(-1) ?? key) === normalizedLeafBase) {
      normalizedLeafBaseSuffixCandidates.push(key);
    }
  }

  const exactSuffixKey = oneMatch(exactSuffixCandidates);
  if (exactSuffixKey) {
    return { metadataId: exactSuffixKey, metadata: catalog[exactSuffixKey], method: "suffix" };
  }

  const segmentSuffixKey = oneMatch(segmentSuffixCandidates);
  if (segmentSuffixKey) {
    return { metadataId: segmentSuffixKey, metadata: catalog[segmentSuffixKey], method: "suffix" };
  }

  const normalizedSuffixKey = oneMatch(normalizedSuffixCandidates);
  if (normalizedSuffixKey) {
    return { metadataId: normalizedSuffixKey, metadata: catalog[normalizedSuffixKey], method: "normalized-suffix" };
  }

  const leafSuffixKey = oneMatch(leafSuffixCandidates);
  if (leafSuffixKey) {
    return { metadataId: leafSuffixKey, metadata: catalog[leafSuffixKey], method: "suffix" };
  }

  const leafBaseSuffixKey = oneMatch(leafBaseSuffixCandidates);
  if (leafBaseSuffixKey) {
    return { metadataId: leafBaseSuffixKey, metadata: catalog[leafBaseSuffixKey], method: "suffix" };
  }

  const normalizedLeafSuffixKey = oneMatch(normalizedLeafSuffixCandidates);
  if (normalizedLeafSuffixKey) {
    return { metadataId: normalizedLeafSuffixKey, metadata: catalog[normalizedLeafSuffixKey], method: "normalized-suffix" };
  }

  const normalizedLeafBaseSuffixKey = oneMatch(normalizedLeafBaseSuffixCandidates);
  if (normalizedLeafBaseSuffixKey) {
    return { metadataId: normalizedLeafBaseSuffixKey, metadata: catalog[normalizedLeafBaseSuffixKey], method: "normalized-suffix" };
  }

  return undefined;
}
