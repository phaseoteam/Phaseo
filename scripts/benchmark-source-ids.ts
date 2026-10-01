export type BenchmarkSource = "artificial_analysis" | "epoch_ai";

// Missing means automatic matching; null explicitly disables this source.
export function benchmarkSourceId(metadata: unknown, source: BenchmarkSource, modelId: string): string | null | undefined {
	if (metadata === null || metadata === undefined) return undefined;
	if (typeof metadata !== "object" || Array.isArray(metadata)) throw new Error(`Invalid model metadata for ${modelId}.`);
	const ids = (metadata as Record<string, unknown>).external_ids;
	if (ids === undefined) return undefined;
	if (!ids || typeof ids !== "object" || Array.isArray(ids)) throw new Error(`Invalid external_ids for ${modelId}.`);
	if (!Object.hasOwn(ids, source)) return undefined;
	const value = (ids as Record<string, unknown>)[source];
	if (value === null) return null;
	if (typeof value !== "string" || !value.trim() || value !== value.trim()) throw new Error(`Invalid ${source} ID for ${modelId}.`);
	if (source === "artificial_analysis" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error(`Invalid Artificial Analysis UUID for ${modelId}.`);
	return value;
}
