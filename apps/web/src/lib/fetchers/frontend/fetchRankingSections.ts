import type {
	ModelRetentionRanking,
	PerformanceData,
	TimeseriesData,
	TopAppData,
} from "@/lib/fetchers/rankings/getRankingsData";
import type { PublicBenchmarkRanking } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { fetchOptionalPublicWebApi, fetchPublicWebApi } from "@/lib/web-api/client";

export async function fetchFrontendRankingBenchmarks() {
	return fetchPublicWebApi<{ benchmarks: PublicBenchmarkRanking[] }>("/api/_web/rankings/benchmarks");
}

export async function fetchFrontendRankingFastestModels(days = 30, limit = 20) {
	return fetchPublicWebApi<{ data: PerformanceData[] }>(
		`/api/_web/rankings/fastest-models?days=${encodeURIComponent(String(days))}&limit=${encodeURIComponent(String(limit))}`,
	);
}

export async function fetchFrontendRankingTextLeaderboard(timeRange = "year", topN = 20) {
	return fetchPublicWebApi<{ data: TimeseriesData[] }>(
		`/api/_web/rankings/text-leaderboard?time_range=${encodeURIComponent(timeRange)}&top_n=${encodeURIComponent(String(topN))}`,
	);
}

export async function fetchFrontendRankingImageInputs(timeRange = "year", topN = 20) {
	return fetchPublicWebApi<{ data: TimeseriesData[] }>(
		`/api/_web/rankings/image-inputs?time_range=${encodeURIComponent(timeRange)}&top_n=${encodeURIComponent(String(topN))}`,
	);
}

export async function fetchFrontendRankingIntelligenceIndex(limit = 20) {
	return fetchPublicWebApi<{ benchmark: PublicBenchmarkRanking | null }>(
		`/api/_web/rankings/intelligence-index?limit=${encodeURIComponent(String(limit))}`,
	);
}

export async function fetchFrontendModelRetentionRankings(limit = 20) {
	const result = await fetchOptionalPublicWebApi<{ data: ModelRetentionRanking[]; methodology: {
		cohortWeeks: number;
		minimumWorkspaceWeeks: number;
		minimumWorkspaces: number;
		minimumWeeks: number;
	} }>(
		`/api/_web/rankings/model-retention?limit=${encodeURIComponent(String(limit))}`,
	);
	return result ?? {
		data: [],
		methodology: { cohortWeeks: 10, minimumWorkspaceWeeks: 25, minimumWorkspaces: 5, minimumWeeks: 2 },
	};
}

export async function fetchFrontendRankingTopApps(timeRange = "week", limit = 20) {
	return fetchPublicWebApi<{ data: TopAppData[] }>(
		`/api/_web/rankings/top-apps?time_range=${encodeURIComponent(timeRange)}&limit=${encodeURIComponent(String(limit))}`,
	);
}

export type PublicGeographyRow = {
	country_code: string;
	requests: number | string;
	tokens: number | string;
	share_percent: number | string;
	workspace_count: number | string;
};

export async function fetchFrontendRankingGeography(days = 30) {
	return fetchPublicWebApi<{ data: PublicGeographyRow[]; days: number }>(
		`/api/_web/rankings/geography?days=${encodeURIComponent(String(days))}`,
	);
}

export type PublicContextLengthRow = {
	bucket_key: string;
	bucket_label: string;
	bucket_order: number | string;
	min_tokens: number | string;
	max_tokens: number | string | null;
	requests: number | string;
	share_percent: number | string;
	workspace_count: number | string;
};

export async function fetchFrontendRankingContextLengths(days = 30) {
	return fetchPublicWebApi<{ data: PublicContextLengthRow[]; days: number }>(
		`/api/_web/rankings/context-lengths?days=${encodeURIComponent(String(days))}`,
	);
}
