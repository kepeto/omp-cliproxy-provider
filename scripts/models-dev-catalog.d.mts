import type { ModelsDevCatalog } from "../src/types.ts";

export declare function normalizeModelsDevCatalog(payload: unknown): ModelsDevCatalog;
export declare function validateCatalogSize(currentCatalog: ModelsDevCatalog, nextCatalog: ModelsDevCatalog): void;