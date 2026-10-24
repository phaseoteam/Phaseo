/**
 * The preset editor needs each model's id, name, status and organisation only.
 * Skipping the gateway data keeps the catalogue request small and edge-cached;
 * the full version waits on a slower query and failed often enough to break the page.
 */
export const PRESET_MODEL_OPTIONS = { includeGatewayData: false } as const;
