import type { PublicBenchmarkRanking, PublicBenchmarkRankingEntry } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { artificialAnalysisMetricKey, artificialAnalysisVersion } from "./artificialAnalysis";

export type ExplorerMetric = "intelligence" | "coding" | "agentic" | "cost";
export type ExplorerPoint = Pick<PublicBenchmarkRankingEntry, "model_id" | "model_name" | "organisation_id" | "organisation_name" | "organisation_colour"> & {
	id: string;
	variant: string | null;
	configuration_label?: string | null;
	intelligence?: number;
	coding?: number;
	agentic?: number;
	cost?: number;
};

/** Join only the same source, methodology, configuration and fetch; never pair best scores from different runs. */
export function buildArtificialAnalysisExplorer(rankings: PublicBenchmarkRanking[]): ExplorerPoint[] {
	const points = new Map<string, ExplorerPoint>();
	const conflicts = new Set<string>();
	for (const ranking of rankings) {
		const metric = artificialAnalysisMetricKey(ranking.benchmark_id) as ExplorerMetric | null;
		if (!metric) continue;
		for (const entry of ranking.entries) for (const config of entry.configurations ?? []) {
			if (!Number.isFinite(config.score) || (metric === "cost" && config.score < 0)) continue;
			const source = config.other_info?.match(/Artificial Analysis ID ([\w-]+)(?:;|$)/)?.[1];
			const version = artificialAnalysisVersion(config.other_info);
			// Unidentified legacy results remain usable as individual scores, but cannot be joined across metrics.
			const id = source && version && config.updated_at
				? JSON.stringify([entry.model_id, source, version, config.variant, config.updated_at])
				: JSON.stringify([entry.model_id, ranking.benchmark_id, config.result_key, config.other_info, config.updated_at]);
			const point = points.get(id) ?? { id, model_id: entry.model_id, model_name: entry.model_name,
				organisation_id: entry.organisation_id, organisation_name: entry.organisation_name,
				organisation_colour: entry.organisation_colour, variant: config.variant,
				configuration_label: config.other_info?.split(";")[0] };
			if (point[metric] !== undefined && point[metric] !== config.score) conflicts.add(id);
			point[metric] = config.score;
			points.set(id, point);
		}
	}
	return [...points.values()].filter((point) => !conflicts.has(point.id));
}
