import { queryOptions } from "@tanstack/react-query";
import {
	fetchFrontendMarketShare,
	fetchFrontendMarketShareTimeseries,
	fetchFrontendModelLeaderboardMetaByIds,
	fetchFrontendOrganisationLogoIdsByNames,
	fetchFrontendProviderNamesByIds,
	fetchFrontendRankingModalityTimeseries,
	fetchFrontendRankingUniqueUserTimeseries,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";
import {
	fetchFrontendRankingFastestModels,
	fetchFrontendRankingPeriodLeaderboard,
} from "@/lib/fetchers/frontend/fetchRankingSections";
import { modalityMetrics, secondaryModalityMetrics } from "@/lib/fetchers/rankings/modalityMetrics";
import type { RankingModality } from "./RankingsPageContent";

type LeaderboardMeta = Awaited<ReturnType<typeof fetchFrontendModelLeaderboardMetaByIds>>;

export const modalityLeaderboardsQuery = (modality: RankingModality) =>
	queryOptions({
		queryKey: ["public-catalog", "rankings", "modality-leaderboards", modality],
		queryFn: async () => {
			const primary = modalityMetrics[modality];
			const secondary = secondaryModalityMetrics[modality];
			const [series, monthly, secondaryMonthly] = await Promise.all([
				fetchFrontendRankingModalityTimeseries(primary.metric, "year").catch(() => null),
				fetchFrontendRankingPeriodLeaderboard(primary.metric, 30).catch(() => null),
				secondary ? fetchFrontendRankingPeriodLeaderboard(secondary.metric, 30).catch(() => null) : null,
			]);
			const modelIds = [...new Set([...(series?.data ?? []), ...(monthly?.data ?? []), ...(secondaryMonthly?.data ?? [])]
				.map((row) => row.model_id).filter((id) => id && !["other", "unknown"].includes(id.toLowerCase())))];
			const metaMap = await fetchFrontendModelLeaderboardMetaByIds(modelIds).catch(
				(): LeaderboardMeta => ({}),
			);
			return { series, monthly, secondaryMonthly, modelIds, metaMap };
		},
	});

export const fastestModelsQuery = () =>
	queryOptions({
		queryKey: ["public-catalog", "rankings", "fastest-models", 30, 100],
		queryFn: async () => {
			const result = await fetchFrontendRankingFastestModels(30, 100).catch(() => null);
			if (!result) return null;
			const [metaMap, providerNames] = await Promise.all([
				fetchFrontendModelLeaderboardMetaByIds([...new Set(result.data.map((row) => row.model_id))]).catch(() => ({})),
				fetchFrontendProviderNamesByIds([...new Set(result.data.map((row) => row.provider))]).catch(() => ({})),
			]);
			return { result, metaMap, providerNames };
		},
	});

export const uniqueUsersQuery = () =>
	queryOptions({
		queryKey: ["public-catalog", "rankings", "unique-users", "year", "week", 10],
		queryFn: async () => {
			const result = await fetchFrontendRankingUniqueUserTimeseries("year", "week", 10).catch(() => null);
			if (!result) return null;
			const modelIds = Array.from(
				new Set(
					result.data
						.map((row) => row.model_id)
						.filter((id) => id && id.toLowerCase() !== "other" && id.toLowerCase() !== "unknown"),
				),
			);
			const metaMap = await fetchFrontendModelLeaderboardMetaByIds(modelIds).catch(
				(): LeaderboardMeta => ({}),
			);
			return { result, modelIds, metaMap };
		},
	});

export const marketShareOrganizationQuery = () =>
	queryOptions({
		queryKey: ["public-catalog", "rankings", "market-share", "organization"],
		queryFn: async () => {
			const [timeseriesResult, leaderboardResult] = await Promise.all([
				fetchFrontendMarketShareTimeseries("organization", "year", "week", 10).catch(() => null),
				fetchFrontendMarketShare("organization", "year").catch(() => null),
			]);
			if (!timeseriesResult || !leaderboardResult) return null;
			const organisationNames = Array.from(
				new Set(
					(leaderboardResult.data ?? [])
						.map((row) => row.name)
						.filter((name) => name && name.toLowerCase() !== "unknown")
				)
			);
			const logoMap = await fetchFrontendOrganisationLogoIdsByNames(organisationNames).catch(
				(): Record<string, string> => ({}),
			);
			return { timeseriesResult, leaderboardResult, logoMap };
		},
	});

export const marketShareProviderQuery = () =>
	queryOptions({
		queryKey: ["public-catalog", "rankings", "market-share", "provider"],
		queryFn: async () => {
			const [timeseriesResult, leaderboardResult] = await Promise.all([
				fetchFrontendMarketShareTimeseries("provider", "year", "week", 10).catch(() => null),
				fetchFrontendMarketShare("provider", "year").catch(() => null),
			]);
			if (!timeseriesResult || !leaderboardResult) return null;
			const providerIds = Array.from(
				new Set(
					[...(timeseriesResult.data ?? []), ...(leaderboardResult.data ?? [])]
						.map((row) => row.name)
						.filter(
							(id) =>
								id &&
								id.toLowerCase() !== "unknown" &&
								id.toLowerCase() !== "other"
						)
				)
			);
			const providerNameMap = await fetchFrontendProviderNamesByIds(providerIds).catch(
				(): Record<string, string> => ({}),
			);
			return { timeseriesResult, leaderboardResult, providerNameMap };
		},
	});
