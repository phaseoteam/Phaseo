import { queryOptions } from "@tanstack/react-query";
import { fetchFrontendArtificialAnalysisData } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { loadDashboardData } from "@/lib/benchmarks/artificialAnalysisDashboard";

/**
 * Every page of the public Artificial Analysis data for one index version.
 * `null` (a versionless benchmark id) resolves to null without fetching, and
 * so do failures.
 */
export const artificialAnalysisDashboardDataQuery = (version: number | null) =>
	queryOptions({
		queryKey: ["phaseo-web", "catalogue-benchmark", "artificial-analysis-dashboard-data", version] as const,
		queryFn: () =>
			version === null
				? Promise.resolve(null)
				: loadDashboardData((offset) => fetchFrontendArtificialAnalysisData({ version, limit: 200, offset })).catch(() => null),
	});
