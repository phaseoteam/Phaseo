// Section queries for ModelOverviewSections. Every optional section raced its
// fetch against the 2.5 s timeout in Next and fell back to an empty value; the
// race now lives in each queryFn, under a "section" key so a timed-out
// fallback is never cached where the shell or another page reads real data.
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import {
	fetchFrontendModelApps,
	fetchFrontendModelBenchmarkHighlights,
	fetchFrontendModelBenchmarkResults,
	fetchFrontendModelPerformanceColos,
	fetchFrontendModelUsageDailyBreakdown,
	fetchFrontendOrganisationModels,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { fetchFrontendModelBenchmarkRanks } from "@/lib/fetchers/frontend/fetchRankingSections";
import type { ModelPerformanceMetrics } from "@/lib/fetchers/models/getModelPerformance";
import {
	getModelLineageLinks,
	resolveModelLineageNames,
} from "@/components/(data)/model/overview/modelOverviewMetadata";
import {
	catalogueModelRoot,
	modelHeaderQuery,
	modelPerformanceQuery,
	modelTimelineQuery,
	withOptionalTimeout,
} from "@/components/(data)/model/modelData.queries";
import {
	getEpochConfidenceIntervals,
	getHiddenModelBenchmarkHighlights,
	getHiddenModelBenchmarkResults,
	getHiddenModelQuickstartGatewayMetadata,
} from "@/components/(data)/model/modelData.functions";

const LOG_PREFIX = "[ModelOverviewSections]";
const sectionRoot = [...catalogueModelRoot, "section"] as const;

const withOptionalSectionTimeout = <T,>(promise: Promise<T>, fallback: T, label: string) =>
	withOptionalTimeout(promise, fallback, label, LOG_PREFIX);

/**
 * Performance metrics for the performance and uptime sections. Without
 * `performancePromise` the public 24 h metrics are read through
 * `modelPerformanceQuery`; a page that passes its own promise (private models)
 * gets a separate cache entry for it.
 */
export const modelPerformanceSectionQuery = (
	queryClient: QueryClient,
	modelId: string,
	performancePromise?: Promise<ModelPerformanceMetrics | null>,
) =>
	queryOptions({
		queryKey: [...sectionRoot, "performance", modelId, performancePromise ? "provided" : "public"] as const,
		queryFn: () =>
			withOptionalSectionTimeout(
				performancePromise ?? queryClient.fetchQuery(modelPerformanceQuery(modelId)),
				null,
				"model performance",
			),
	});

export const modelPerformanceColosSectionQuery = (modelId: string) =>
	queryOptions({
		queryKey: [...sectionRoot, "performance-colos", modelId] as const,
		queryFn: () =>
			withOptionalSectionTimeout(
				fetchFrontendModelPerformanceColos(modelId),
				[],
				"performance execution regions",
			),
	});

export const modelAppsSectionQuery = (modelId: string) =>
	queryOptions({
		queryKey: [...sectionRoot, "apps", modelId] as const,
		queryFn: () => withOptionalSectionTimeout(fetchFrontendModelApps(modelId), [], "model apps"),
	});

export const modelActivitySectionQuery = (modelId: string) =>
	queryOptions({
		queryKey: [...sectionRoot, "activity", modelId, 30] as const,
		queryFn: () =>
			withOptionalSectionTimeout(
				fetchFrontendModelUsageDailyBreakdown({ modelId, days: 30 }),
				[],
				"model activity",
			),
	});

/** Quickstart metadata for hidden models (admin-aware, server function). */
export const modelHiddenQuickstartMetadataSectionQuery = (modelId: string) =>
	queryOptions({
		queryKey: [...sectionRoot, "hidden-quickstart-metadata", modelId] as const,
		queryFn: () =>
			withOptionalSectionTimeout(
				getHiddenModelQuickstartGatewayMetadata({ data: modelId }),
				null,
				"quickstart metadata",
			),
	});

export const modelBenchmarkHighlightsSectionQuery = (modelId: string, includeHidden: boolean) =>
	queryOptions({
		queryKey: [...sectionRoot, "benchmark-highlights", modelId, includeHidden] as const,
		queryFn: () =>
			withOptionalSectionTimeout(
				includeHidden
					? getHiddenModelBenchmarkHighlights({ data: modelId })
					: fetchFrontendModelBenchmarkHighlights(modelId, false),
				[],
				"benchmark highlights",
			),
	});

export const modelBenchmarkResultsSectionQuery = (modelId: string, includeHidden: boolean) =>
	queryOptions({
		queryKey: [...sectionRoot, "benchmark-results", modelId, includeHidden] as const,
		queryFn: () =>
			withOptionalSectionTimeout(
				includeHidden
					? getHiddenModelBenchmarkResults({ data: modelId })
					: fetchFrontendModelBenchmarkResults(modelId, false),
				[],
				"benchmark results",
			),
	});

/** This model's place on the leaderboards (~10 KB), not every leaderboard (~1 MB). */
export const modelBenchmarkRanksSectionQuery = (modelId: string) =>
	queryOptions({
		queryKey: [...sectionRoot, "benchmark-ranks", modelId] as const,
		queryFn: () =>
			withOptionalSectionTimeout(
				fetchFrontendModelBenchmarkRanks(modelId),
				null,
				"benchmark rankings",
			),
	});

export const epochConfidenceIntervalsSectionQuery = () =>
	queryOptions({
		queryKey: [...sectionRoot, "epoch-confidence-intervals"] as const,
		queryFn: () =>
			withOptionalSectionTimeout<Record<string, { low: number; high: number }>>(
				getEpochConfidenceIntervals(),
				{},
				"Epoch confidence intervals",
			),
	});

export const modelBenchmarkIdentitySectionQuery = (
	queryClient: QueryClient,
	modelId: string,
	includeHidden: boolean,
) =>
	queryOptions({
		queryKey: [...sectionRoot, "benchmark-identity", modelId, includeHidden] as const,
		queryFn: () =>
			withOptionalSectionTimeout(
				queryClient.fetchQuery(modelHeaderQuery(modelId, includeHidden)),
				null,
				"benchmark model identity",
			),
	});

/**
 * Previous/next model links for the lineage and about sections: the model
 * timeline (when asked for) plus public header names for links that only
 * carry an id, each with the section timeout.
 */
export const modelLineageSectionQuery = (
	queryClient: QueryClient,
	args: { modelId: string; previousModelId: string | null | undefined; includeTimeline: boolean },
) =>
	queryOptions({
		queryKey: [...sectionRoot, "lineage", args.modelId, args.previousModelId ?? null, args.includeTimeline] as const,
		queryFn: async () => {
			const timeline = args.includeTimeline
				? await withOptionalSectionTimeout(
						queryClient.fetchQuery(modelTimelineQuery(args.modelId)),
						null,
						"model lineage",
					)
				: null;
			return resolveModelLineageNames(
				getModelLineageLinks(timeline?.events, args.previousModelId),
				async (lineageModelId) =>
					(
						await withOptionalSectionTimeout(
							queryClient.fetchQuery(modelHeaderQuery(lineageModelId)),
							null,
							"lineage model name",
						)
					)?.name,
			);
		},
	});

/** Ten newest models of the creator (nine others are shown). */
export const modelCreatorModelsSectionQuery = (organisationId: string) =>
	queryOptions({
		queryKey: [...sectionRoot, "creator-models", organisationId, 10] as const,
		queryFn: () =>
			withOptionalSectionTimeout(
				fetchFrontendOrganisationModels(organisationId, { limit: 10 }),
				[],
				"creator models",
			),
	});
