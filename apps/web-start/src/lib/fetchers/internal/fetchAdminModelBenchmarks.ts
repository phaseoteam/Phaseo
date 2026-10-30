import { fetchAdminModelSource } from "./fetchAdminModelSource";
import { fetchAdminCatalogRecord } from "./fetchAdminCatalog";
import type { ModelBenchmarkResult } from "@/lib/fetchers/models/getModelBenchmarkData";

export async function fetchAdminModelBenchmarks(modelId: string): Promise<ModelBenchmarkResult[]> {
	const source = await fetchAdminModelSource(modelId);
	const results: Array<Record<string, any>> = source.model?.benchmark_results ?? [];
	const ids = [...new Set(results.map((row) => String(row.benchmark_id)))];
	const definitions = new Map(await Promise.all(ids.map(async (id) => [id, (await fetchAdminCatalogRecord("benchmark", id)).row] as const)));
	return results.map((row) => {
		const id = String(row.benchmark_id);
		const definition = definitions.get(id);
		const score = row.score == null ? null : Number(row.score);
		return {
			id: String(row.result_id ?? row.id), benchmark_id: id,
			score: score !== null && Number.isFinite(score) ? score : null,
			raw_score: row.score ?? null, score_display: String(row.score ?? "—"),
			is_percentage: false, is_self_reported: row.is_self_reported === true,
			other_info: row.other_info ?? null, source_link: row.source_link ?? null,
			created_at: row.created_at ?? null, updated_at: row.updated_at ?? null,
			rank: null, variant: row.variant ?? null,
			benchmark: { id, name: definition?.name ?? id, category: definition?.category ?? null, link: definition?.link ?? null, total_models: null, max_score: null, order: null, ascending_order: definition?.ascending_order ?? null, type: "numerical" as const },
		};
	});
}
