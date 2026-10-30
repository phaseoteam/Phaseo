import { queryOptions } from "@tanstack/react-query";
import {
	applyArtificialAnalysisOrganisationColours,
	artificialAnalysisMetricsForBenchmark,
	buildArtificialAnalysisRanking,
	isArtificialAnalysisBenchmark,
} from "@/lib/benchmarks/artificialAnalysis";
import { fetchFrontendBenchmark, fetchFrontendOrganisations } from "@/lib/fetchers/frontend/fetchPublicCatalog";

type Benchmark = NonNullable<Awaited<ReturnType<typeof fetchFrontendBenchmark>>>;

/** Version/metric only apply to the Artificial Analysis benchmark page. */
export function benchmarkSelection(benchmarkId: string, search: Record<string, unknown>) {
	if (benchmarkId !== "artificial-analysis") return { version: undefined, metric: undefined };
	return {
		version: typeof search.version === "string" ? search.version : undefined,
		metric: typeof search.metric === "string" ? search.metric : undefined,
	};
}

export const benchmarkQuery = (benchmarkId: string, selection: { version?: string; metric?: string }) =>
	queryOptions({
		queryKey: ["public-catalog", "benchmark", benchmarkId, selection.version ?? null, selection.metric ?? null],
		queryFn: () => fetchFrontendBenchmark(benchmarkId, selection),
	});

/** Rankings for the Artificial Analysis page; other benchmarks resolve to []. */
export const artificialAnalysisRankingsQuery = (benchmark: Benchmark | null, selectionKey: string) =>
	queryOptions({
		queryKey: ["public-catalog", "benchmark-aa-rankings", benchmark?.id ?? null, selectionKey],
		queryFn: async () => {
			if (!benchmark || !isArtificialAnalysisBenchmark(benchmark.id)) return [];
			const metricDefinitions = artificialAnalysisMetricsForBenchmark(benchmark.id);
			const [rankings, organisations] = await Promise.all([
				Promise.all(metricDefinitions.map(async ({ id }) => {
					const metricBenchmark = benchmark.comparison_benchmarks?.find((metric) => metric.id === id)
						?? (id === benchmark.id ? benchmark : await fetchFrontendBenchmark(id).catch(() => null));
					return metricBenchmark ? buildArtificialAnalysisRanking(metricBenchmark) : null;
				})),
				fetchFrontendOrganisations().catch(() => []),
			]);
			const colours = new Map(organisations.map((organisation) => [organisation.organisation_id, organisation.colour]));
			return applyArtificialAnalysisOrganisationColours(
				rankings.filter((ranking): ranking is NonNullable<typeof ranking> => ranking !== null),
				colours,
			);
		},
	});
