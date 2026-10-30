// Public rankings sections. The fetchers call the public web API, so these
// queries run during SSR and in the browser alike. Each section's failure
// handling (`.catch(() => null)`) lives in the queryFn, so a failed section
// renders its "unavailable" state instead of throwing.
import { queryOptions } from "@tanstack/react-query";
import {
	fetchFrontendModelLeaderboardMetaByIds,
	fetchFrontendModelRankings,
	fetchFrontendRankingToolCallTimeseries,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";
import {
	fetchFrontendModelRetentionRankings,
	fetchFrontendRankingBenchmarks,
	fetchFrontendRankingContextLengths,
	fetchFrontendRankingGeography,
	fetchFrontendRankingImageInputs,
	fetchFrontendRankingTopApps,
} from "@/lib/fetchers/frontend/fetchRankingSections";

type LeaderboardMeta = Awaited<ReturnType<typeof fetchFrontendModelLeaderboardMetaByIds>>;

export const rankingBenchmarksSectionQuery = () =>
	queryOptions({
		queryKey: ["rankings-section", "benchmarks"],
		queryFn: () => fetchFrontendRankingBenchmarks().catch(() => null),
	});

export const rankingContextLengthsSectionQuery = (days = 30) =>
	queryOptions({
		queryKey: ["rankings-section", "context-lengths", days],
		queryFn: () => fetchFrontendRankingContextLengths(days).catch(() => null),
	});

export const rankingGeographySectionQuery = (days = 30) =>
	queryOptions({
		queryKey: ["rankings-section", "geography", days],
		queryFn: () => fetchFrontendRankingGeography(days).catch(() => null),
	});

export const rankingRetentionSectionQuery = (limit = 20) =>
	queryOptions({
		queryKey: ["rankings-section", "retention", limit],
		queryFn: () => fetchFrontendModelRetentionRankings(limit).catch(() => null),
	});

/** All three ranges, each `null` when its fetch failed. */
export const rankingTopAppsSectionQuery = (limit = 20) =>
	queryOptions({
		queryKey: ["rankings-section", "top-apps", limit],
		queryFn: async () => {
			const [today, week, month] = await Promise.all([
				fetchFrontendRankingTopApps("today", limit).catch(() => null),
				fetchFrontendRankingTopApps("week", limit).catch(() => null),
				fetchFrontendRankingTopApps("month", limit).catch(() => null),
			]);
			return { today, week, month };
		},
	});

/** Image-input usage plus leaderboard metadata for its models; `null` when the usage fetch failed. */
export const rankingImageInputsSectionQuery = () =>
	queryOptions({
		queryKey: ["rankings-section", "image-inputs", "year", 20],
		queryFn: async () => {
			const result = await fetchFrontendRankingImageInputs("year", 20).catch(() => null);
			if (!result) return null;
			const modelIds = [...new Set(result.data.map((row) => row.model_id).filter(Boolean))];
			const metaMap = await fetchFrontendModelLeaderboardMetaByIds(modelIds).catch((): LeaderboardMeta => ({}));
			return { result, modelIds, metaMap };
		},
	});

/** Tool-call usage plus leaderboard metadata for its models; `null` when the usage fetch failed. */
export const rankingToolCallsSectionQuery = () =>
	queryOptions({
		queryKey: ["rankings-section", "tool-calls", "year", "week", 10],
		queryFn: async () => {
			const result = await fetchFrontendRankingToolCallTimeseries("year", "week", 10).catch(() => null);
			if (!result) return null;
			const modelIds = Array.from(
				new Set(
					result.data
						.map((row) => row.model_id)
						.filter(
							(id) =>
								id &&
								id.toLowerCase() !== "other" &&
								id.toLowerCase() !== "unknown",
						),
				),
			);
			const metaMap = await fetchFrontendModelLeaderboardMetaByIds(modelIds).catch((): LeaderboardMeta => ({}));
			return { result, modelIds, metaMap };
		},
	});

export const rankingSummaryStatsQuery = () =>
	queryOptions({
		queryKey: ["rankings-section", "summary-stats"],
		queryFn: () => fetchFrontendModelRankings(),
	});
