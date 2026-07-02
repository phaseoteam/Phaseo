import { cacheLife, cacheTag } from "next/cache";
import {
	MODEL_LIST_TAGS,
	PUBLIC_MODEL_CATALOGUE_CACHE_LIFE,
} from "@/lib/cache/publicModelCatalogueTags";
import { createAdminClient } from "@/utils/supabase/admin";
import type { AppDetails } from "@/lib/fetchers/apps/getAppDetails";
import {
	getAppDetailsCached,
	getPublicAppIdsCached,
	isPublicAppId,
} from "@/lib/fetchers/apps/getAppDetails";
import type { ProfileSnapshot } from "@/lib/fetchers/profile/getProfileSnapshot";
import { getPublicProfileSnapshot } from "@/lib/fetchers/profile/getProfileSnapshot";
import type {
	OgEntity,
	OgPayload,
} from "@/lib/fetchers/frontend/getOgPayload";
import { getFrontendOgPayload } from "@/lib/fetchers/frontend/getOgPayload";
import type { SignInModel } from "@/lib/fetchers/landing/sign-in/getMainModels";
import { getMainModelsCached } from "@/lib/fetchers/landing/sign-in/getMainModels";
import type { SupportedModelsStats } from "@/lib/fetchers/landing/sign-in/getSupportedModelsStats";
import { getSupportedModelsStatsCached } from "@/lib/fetchers/landing/sign-in/getSupportedModelsStats";
import type {
	AppUsageRow,
	RangeKey,
} from "@/lib/fetchers/apps/getAppUsageOverTime";
import {
	getAppUsageOverTime,
	getRecentAppRequests,
} from "@/lib/fetchers/apps/getAppUsageOverTime";
import type { ExtendedModel } from "@/data/types";
import type { APIProviderCard } from "@/lib/fetchers/api-providers/getAllAPIProviders";
import { getAllAPIProvidersCached } from "@/lib/fetchers/api-providers/getAllAPIProviders";
import type { APIProviderHeader } from "@/lib/fetchers/api-providers/getAPIProviderHeader";
import getAPIProviderHeader from "@/lib/fetchers/api-providers/getAPIProviderHeader";
import type { APIProviderModelListItem } from "@/lib/fetchers/api-providers/getAPIProvider";
import { getAPIProviderModelsListByModelDateCached } from "@/lib/fetchers/api-providers/getAPIProvider";
import type { ProviderAppTokenTimeseries } from "@/lib/fetchers/api-providers/api-provider/providerAppTokenTimeseries";
import { getProviderAppTokenTimeseries } from "@/lib/fetchers/api-providers/api-provider/providerAppTokenTimeseries";
import type { ProviderTokenTimeseries } from "@/lib/fetchers/api-providers/api-provider/providerTokenTimeseries";
import { getProviderModelTokenTimeseries } from "@/lib/fetchers/api-providers/api-provider/providerTokenTimeseries";
import type { AppStats } from "@/lib/fetchers/api-providers/api-provider/top-apps";
import { getTopAppsCached } from "@/lib/fetchers/api-providers/api-provider/top-apps";
import type { ModelStats } from "@/lib/fetchers/api-providers/api-provider/top-models";
import { getTopModelsCached } from "@/lib/fetchers/api-providers/api-provider/top-models";
import type { ProviderMetrics } from "@/lib/fetchers/api-providers/getProviderMetrics";
import { getProviderMetrics } from "@/lib/fetchers/api-providers/getProviderMetrics";
import type { APIProviderUpdates } from "@/lib/fetchers/api-providers/getAPIProviderUpdates";
import { getAPIProviderUpdatesCached } from "@/lib/fetchers/api-providers/getAPIProviderUpdates";
import type { BenchmarkCard } from "@/lib/fetchers/benchmarks/getAllBenchmarks";
import { getAllBenchmarksCached } from "@/lib/fetchers/benchmarks/getAllBenchmarks";
import type { BenchmarkPage } from "@/lib/fetchers/benchmarks/getBenchmark";
import { getBenchmarkCached } from "@/lib/fetchers/benchmarks/getBenchmark";
import type { CountrySummary } from "@/lib/fetchers/countries/getCountrySummaries";
import { getCountrySummariesCached } from "@/lib/fetchers/countries/getCountrySummaries";
import { getCountrySummaryByIsoCached } from "@/lib/fetchers/countries/getCountrySummary";
import { loadCompareModelsCached } from "@/lib/fetchers/compare/loadCompareModels";
import { getComparisonModelsCached } from "@/lib/fetchers/compare/getComparisonModels";
import type { ModelCollection } from "@/lib/fetchers/collections/getCollections";
import { getModelCollections } from "@/lib/fetchers/collections/getCollections";
import type { FamilyCard } from "@/lib/fetchers/families/getAllFamilies";
import { getAllFamiliesCached } from "@/lib/fetchers/families/getAllFamilies";
import type {
	MarketplacePreset,
	MarketplacePresetDetail,
} from "@/lib/fetchers/gateway/marketplace";
import {
	getPublicMarketplacePresetDetailCached,
	getPublicMarketplacePresetsCached,
} from "@/lib/fetchers/gateway/marketplace";
import { getGatewayMarketingMetrics } from "@/lib/fetchers/gateway/getMarketingMetrics";
import {
	getModelAppsCached,
	type ModelAppUsage,
} from "@/lib/fetchers/models/getModelApps";
import {
	getModelBenchmarkHighlights,
	type ModelBenchmarkHighlight,
} from "@/lib/fetchers/models/getModelBenchmarkData";
import {
	getModelGatewayMetadataCached,
	type ModelGatewayMetadata,
} from "@/lib/fetchers/models/getModelGatewayMetadata";
import type { FreeRouterOverview } from "@/lib/fetchers/models/getFreeRouterOverview";
import { getFreeRouterOverview } from "@/lib/fetchers/models/getFreeRouterOverview";
import getModelOverviewHeader, {
	type ModelOverviewHeader,
} from "@/lib/fetchers/models/getModelOverviewHeader";
import {
	getModelPageNotice,
	type ModelPageNotice,
} from "@/lib/fetchers/models/getModelPageNotice";
import {
	getModelPendingApiReleaseState,
	type ModelPendingApiReleaseState,
} from "@/lib/fetchers/models/getModelPendingApiReleaseState";
import type {
	ModelPerformanceActivitySnapshot,
	ModelPerformanceMetrics,
} from "@/lib/fetchers/models/getModelPerformance";
import {
	getModelPerformanceActivitySnapshotCached,
	getModelPerformanceMetricsCached,
} from "@/lib/fetchers/models/getModelPerformance";
import {
	getModelPricingCached,
	type ProviderPricing,
} from "@/lib/fetchers/models/getModelPricing";
import {
	getModelPricingHistoryRules,
	type ModelPricingHistoryProviderInput,
	type ModelPricingHistoryRule,
} from "@/lib/fetchers/models/getModelPricingHistoryRules";
import type {
	ProviderHealthMetricsMap,
	ProviderRuntimeStatsMap,
} from "@/lib/fetchers/models/getModelProviderRuntimeStats";
import {
	getModelProviderHealthMetricsCached,
	getModelProviderRuntimeStatsCached,
} from "@/lib/fetchers/models/getModelProviderRuntimeStats";
import {
	getModelUsageDailyBreakdownCached,
	type ModelUsageDailyBreakdownRow,
} from "@/lib/fetchers/models/getModelUsageDailyBreakdown";
import {
	getModelProviderRoutingHealthCached,
	type ProviderRoutingStatusMap,
} from "@/lib/fetchers/models/getModelProviderRoutingHealth";
import {
	getModelRealtimeWindowStatsCached,
	type ModelRealtimeWindowStats,
} from "@/lib/fetchers/models/getModelRealtimeWindowStats";
import {
	getModelSubscriptionPlansCached,
	type SubscriptionPlan,
} from "@/lib/fetchers/models/getModelSubscriptionPlans";
import {
	getModelTimelineCached,
	type RawEvent,
} from "@/lib/fetchers/models/getModelTimeline";
import {
	getModelTokenTrajectoryCached,
	type ModelTokenTrajectory,
} from "@/lib/fetchers/models/getModelTokenTrajectory";
import type { FamilyInfo } from "@/lib/fetchers/models/getFamilyModels";
import { getFamilyModelsCached } from "@/lib/fetchers/models/getFamilyModels";
import type { ModelCard } from "@/lib/fetchers/models/getAllModels";
import { getFrontendModelsPayload } from "@/lib/fetchers/frontend/getFrontendModelsPayload";
import {
	getModelOverviewCached,
	type ModelOverviewPage,
} from "@/lib/fetchers/models/getModel";
import type { MonitorModelData } from "@/lib/fetchers/models/table-view/getMonitorModels";
import { getMonitorModels } from "@/lib/fetchers/models/table-view/getMonitorModels";
import {
	resolveCanonicalModelId,
	type ResolveCanonicalModelIdResult,
} from "@/lib/fetchers/models/resolveCanonicalModelId";
import type { OrganisationCard } from "@/lib/fetchers/organisations/getAllOrganisations";
import { getAllOrganisationsCached } from "@/lib/fetchers/organisations/getAllOrganisations";
import type {
	OrganisationData,
	OrganisationModelCards,
} from "@/lib/fetchers/organisations/getOrganisation";
import {
	getOrganisationDataCached,
	getOrganisationModelsCached,
} from "@/lib/fetchers/organisations/getOrganisation";
import getOrganisationOverviewHeader, {
	type OrganisationOverviewHeader,
} from "@/lib/fetchers/organisations/getOrganisationOverviewHeader";
import type { SubscriptionPlanSummary } from "@/lib/fetchers/subscription-plans/getAllSubscriptionPlans";
import { getAllSubscriptionPlansCached } from "@/lib/fetchers/subscription-plans/getAllSubscriptionPlans";
import type { SubscriptionPlanDetails } from "@/lib/fetchers/subscription-plans/getSubscriptionPlan";
import { getSubscriptionPlanCached } from "@/lib/fetchers/subscription-plans/getSubscriptionPlan";
import type { PricingModel } from "@/lib/fetchers/pricing/getPricingModels";
import { getPricingModelsCached } from "@/lib/fetchers/pricing/getPricingModels";
import type {
	AppsIndexabilitySnapshot,
	MarketShareData,
	MarketShareTimeseriesData,
	ModelLeaderboardMeta,
	MultimodalData,
	PerformanceData,
	ProviderMeta,
	RankingsIndexabilitySnapshot,
	RankingsResponse,
	TimeseriesData,
	TopAppData,
	TrendingAppData,
} from "@/lib/fetchers/rankings/getRankingsData";
import {
	getAppImageUrlsByIds,
	getAppsIndexabilitySnapshot,
	getMarketShare,
	getMarketShareTimeseries,
	getModelLeaderboardMetaByIds,
	getModelNamesByIds,
	getMultimodalBreakdown,
	getOrganisationLogoIdsByNames,
	getPerformanceData,
	getProviderMetaByIds,
	getProviderNamesByIds,
	getRankings,
	getRankingsIndexabilitySnapshot,
	getTimeseriesData,
	getTopApps,
	getTrendingApps,
	getPublicMonthlyTokenTotal,
	getTopModelsWithMetadata,
} from "@/lib/fetchers/rankings/getRankingsData";
import getDbStats from "@/lib/fetchers/landing/dbStats";
import type { UpdateCardProps } from "@/lib/fetchers/updates/getLatestUpdates";
import { getLatestUpdateCards } from "@/lib/fetchers/updates/getLatestUpdates";
import type { UpdateCardProps as ModelUpdateCardProps } from "@/lib/fetchers/updates/getLatestModelUpdates";
import { getLatestModelUpdateCards } from "@/lib/fetchers/updates/getLatestModelUpdates";
import type {
	ModelEvent,
	ModelEventSegments,
} from "@/lib/fetchers/updates/getModelUpdates";
import {
	getOrganisationReleaseEvents,
	getRecentModelUpdatesSplit,
} from "@/lib/fetchers/updates/getModelUpdates";
import { getWebUpdatesCached } from "@/lib/fetchers/updates/getWebUpdates";
import { getYouTubeUpdatesCached } from "@/lib/fetchers/updates/getYouTubeUpdates";
import type {
	MonitorHistoryDbPage,
	MonitorHistoryInitialData,
	MonitorHistoryPageFilters,
} from "@/lib/fetchers/monitor/getMonitorHistory";
import {
	fetchMonitorHistoryPageFromDb,
	getMonitorHistoryInitialData,
} from "@/lib/fetchers/monitor/getMonitorHistory";

export type FrontendLandingStats = {
	db: Awaited<ReturnType<typeof getDbStats>>;
	monthlyTokenTotal: number;
};

export type FrontendGatewayShowcaseData = {
	appImageUrls: Record<string, string | null>;
	metrics: Awaited<ReturnType<typeof getGatewayMarketingMetrics>>;
	topApps: Awaited<ReturnType<typeof getTopApps>>;
	topModels: Awaited<ReturnType<typeof getTopModelsWithMetadata>>;
};

export type ProviderModelMapping = {
	provider_id: string | null;
	api_model_id: string | null;
	model_id: string | null;
};

function buildPricingHistoryProviderInputs(
	providers: ProviderPricing[],
): ModelPricingHistoryProviderInput[] {
	return providers
		.filter(
			(provider) =>
				Array.isArray(provider.provider_models) &&
				provider.provider_models.length > 0,
		)
		.map((provider) => ({
			providerId: provider.provider.api_provider_id,
			providerName:
				provider.provider.api_provider_name ||
				provider.provider.api_provider_id,
			models: Array.from(
				new Map(
					provider.provider_models.map((providerModel) => {
						const apiProviderId = String(
							providerModel.api_provider_id ?? "",
						).trim();
						const providerModelId = String(
							providerModel.model_id ?? "",
						).trim();
						const endpoint = String(providerModel.endpoint ?? "").trim();
						const key = `${apiProviderId}:${providerModelId}:${endpoint}`;
						return [
							key,
							{
								apiProviderId,
								modelId: providerModelId,
								endpoint,
							},
						];
					}),
				).values(),
			)
				.filter(
					(model) =>
						Boolean(model.apiProviderId) &&
						Boolean(model.modelId) &&
						Boolean(model.endpoint),
				)
				.sort((left, right) => {
					const providerCompare = left.apiProviderId.localeCompare(
						right.apiProviderId,
					);
					if (providerCompare !== 0) return providerCompare;
					const modelCompare = left.modelId.localeCompare(right.modelId);
					if (modelCompare !== 0) return modelCompare;
					return left.endpoint.localeCompare(right.endpoint);
				}),
		}))
		.sort((left, right) => left.providerId.localeCompare(right.providerId));
}

export async function fetchFrontendModels(): Promise<ModelCard[]> {
	"use cache";

	cacheLife(PUBLIC_MODEL_CATALOGUE_CACHE_LIFE);
	for (const tag of MODEL_LIST_TAGS) {
		cacheTag(tag);
	}

	return getFrontendModelsPayload();
}

export async function fetchFrontendModelCollections(
	limit = 10,
): Promise<ModelCollection[]> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("collections");
	cacheTag("frontend:model-collections");
	cacheTag("data:models");
	cacheTag("data:benchmarks");
	cacheTag("data:data_api_provider_models");
	cacheTag("data:data_api_pricing_rules");
	cacheTag("data:data_api_provider_model_capabilities");

	return getModelCollections(limit);
}

export type FrontendMonitorModelsResult = {
	models: MonitorModelData[];
	allTiers: string[];
	allEndpoints: string[];
	allModalities: string[];
	allFeatures: string[];
	allStatuses: string[];
};

export async function fetchFrontendMonitorModels(): Promise<FrontendMonitorModelsResult> {
	"use cache";

	cacheLife("minutes");
	cacheTag("public-model-catalogue");
	cacheTag("models:monitor");
	cacheTag("monitor-models");
	cacheTag("frontend:monitor-models");
	cacheTag("data:data_api_model_aliases");
	cacheTag("data:data_api_provider_model_capabilities");
	cacheTag("data:data_api_provider_models");
	cacheTag("data:data_api_pricing_rules");
	cacheTag("data:models");
	cacheTag("data:api_providers");

	return getMonitorModels({}, false);
}

export async function fetchFrontendFreeRouterOverview(): Promise<FreeRouterOverview> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:free-router-overview");
	cacheTag("data:data_api_provider_models");
	cacheTag("data:data_api_pricing_rules");
	cacheTag("data:data_models");
	cacheTag("data:gateway_requests");

	return getFreeRouterOverview();
}

export async function fetchFrontendLandingStats(): Promise<FrontendLandingStats> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("landing:db-stats");
	cacheTag("frontend:landing-stats");
	cacheTag("public-rankings");
	cacheTag("data:gateway_requests");
	cacheTag("data:models");
	cacheTag("data:organisations");
	cacheTag("data:benchmarks");
	cacheTag("data:api_providers");

	const [db, monthlyTokenTotal] = await Promise.all([
		getDbStats(),
		getPublicMonthlyTokenTotal(),
	]);
	return { db, monthlyTokenTotal };
}

export async function fetchFrontendGatewayShowcase(args: {
	topModelsLimit?: number;
	topAppsLimit?: number;
} = {}): Promise<FrontendGatewayShowcaseData> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:gateway-showcase");
	cacheTag("gateway:marketing-metrics");
	cacheTag("public-rankings");
	cacheTag("public-top-apps");
	cacheTag("data:gateway_requests");
	cacheTag("data:models");
	cacheTag("data:api_providers");
	cacheTag("data:public_apps");

	const monthlyWindowHours = 24 * 30;
	const topModelsLimit = Math.max(0, Math.min(25, args.topModelsLimit ?? 6));
	const topAppsLimit = Math.max(0, Math.min(50, args.topAppsLimit ?? 25));
	const [metrics, topModels, topApps] = await Promise.all([
		getGatewayMarketingMetrics(monthlyWindowHours),
		getTopModelsWithMetadata("week", topModelsLimit),
		getTopApps("week", topAppsLimit),
	]);
	const topAppRows = [...(topApps.data ?? [])]
		.filter((row) => Number(row.tokens ?? 0) > 0)
		.filter((row) => Boolean(row.app_id))
		.sort((a, b) => Number(b.tokens ?? 0) - Number(a.tokens ?? 0))
		.slice(0, 6);
	const appIds = Array.from(
		new Set(topAppRows.map((row) => row.app_id).filter(Boolean)),
	);
	const appImageUrls = await getAppImageUrlsByIds(appIds);

	return { appImageUrls, metrics, topApps, topModels };
}

export async function fetchFrontendMonitorHistoryInitialData(): Promise<MonitorHistoryInitialData> {
	"use cache";

	cacheLife("minutes");
	cacheTag("public-model-catalogue");
	cacheTag("monitor-history");
	cacheTag("frontend:monitor-history");

	return getMonitorHistoryInitialData();
}

export async function fetchFrontendMonitorHistoryPage(
	filters: MonitorHistoryPageFilters = {},
): Promise<MonitorHistoryDbPage> {
	"use cache";

	cacheLife("minutes");
	cacheTag("public-model-catalogue");
	cacheTag("monitor-history");
	cacheTag("frontend:monitor-history");

	return fetchMonitorHistoryPageFromDb(filters);
}

export async function fetchFrontendModelOverview(
	modelId: string,
): Promise<ModelOverviewPage | null> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:model-overview");
	cacheTag("data:models");
	cacheTag(`data:models:${modelId}`);
	cacheTag(`model:data:${modelId}`);

	return getModelOverviewCached(modelId, false);
}

export async function fetchFrontendModelHeader(
	modelId: string,
	includeHidden = false,
): Promise<ModelOverviewHeader | null> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:model-header");
	cacheTag("data:models");
	cacheTag("data:organisations");
	cacheTag("data:data_api_models");
	cacheTag("data:data_api_provider_models");
	cacheTag(`model:data:${modelId}`);
	cacheTag(`model:header:${modelId}`);

	return getModelOverviewHeader(modelId, includeHidden);
}

export async function fetchFrontendModelPageNotice(
	modelId: string,
	includeHidden = false,
): Promise<ModelPageNotice | null> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:model-notice");
	cacheTag("data:models");
	cacheTag("data:data_api_models");
	cacheTag("data:data_api_provider_models");
	cacheTag("data:model_aliases");
	cacheTag("data:data_api_model_page_notices");
	cacheTag(`model:notice:resolve:${modelId}`);
	cacheTag(`model:notice:${modelId}`);

	return getModelPageNotice(modelId, includeHidden);
}

export async function fetchFrontendCanonicalModelId(
	modelId: string,
	includeHidden = false,
): Promise<ResolveCanonicalModelIdResult> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:model-canonical");
	cacheTag("data:models");
	cacheTag("data:model_aliases");
	cacheTag("data:data_api_provider_models");
	cacheTag("data:data_api_models");
	cacheTag(`model:canonical:${modelId}`);

	return resolveCanonicalModelId(modelId, includeHidden);
}

export async function fetchFrontendModelPendingApiReleaseState(
	modelId: string,
	includeHidden = false,
): Promise<ModelPendingApiReleaseState> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:model-pending-api-release");
	cacheTag("data:models");
	cacheTag("data:data_api_provider_models");
	cacheTag("data:data_api_pricing_rules");
	cacheTag(`model:data:${modelId}`);
	cacheTag(`model:api:${modelId}`);

	return getModelPendingApiReleaseState(modelId, includeHidden);
}

export async function fetchFrontendModelPricing(
	modelId: string,
): Promise<ProviderPricing[]> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:model-pricing");
	cacheTag("data:api_providers");
	cacheTag("data:data_api_provider_models");
	cacheTag("data:data_api_pricing_rules");
	cacheTag(`model:api:${modelId}`);

	return getModelPricingCached(modelId, false);
}

export async function fetchFrontendModelPricingHistory(
	modelId: string,
	options: { includeHidden?: boolean; days?: number } = {},
): Promise<ModelPricingHistoryRule[]> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:model-pricing-history");
	cacheTag("data:data_api_pricing_rules");
	cacheTag("data:data_api_provider_models");
	cacheTag(`data:models:${modelId}`);
	cacheTag(`model:api:${modelId}`);
	cacheTag(`model:pricing-history:${modelId}`);

	const providers = await getModelPricingCached(
		modelId,
		Boolean(options.includeHidden),
	);
	return getModelPricingHistoryRules({
		modelId,
		providers: buildPricingHistoryProviderInputs(providers),
		days: options.days ?? 30,
	});
}

export async function fetchFrontendModelSubscriptionPlans(
	modelId: string,
): Promise<SubscriptionPlan[]> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:model-subscription-plans");
	cacheTag("data:subscription_plans");
	cacheTag(`model:api:${modelId}`);

	return getModelSubscriptionPlansCached(modelId, false);
}

export async function fetchFrontendModelGatewayMetadata(
	modelId: string,
): Promise<ModelGatewayMetadata> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:model-gateway-metadata");
	cacheTag("data:api_providers");
	cacheTag("data:data_api_provider_models");
	cacheTag(`model:api:${modelId}`);

	return getModelGatewayMetadataCached(modelId, false);
}

export async function fetchFrontendModelTimeline(
	modelId: string,
): Promise<{ events: RawEvent[] } | null> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:model-timeline");
	cacheTag("data:models");
	cacheTag(`data:models:${modelId}`);
	cacheTag(`model:data:${modelId}`);

	return getModelTimelineCached(modelId, false);
}

export async function fetchFrontendModelApps(
	modelId: string,
): Promise<ModelAppUsage[]> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:model-apps");
	cacheTag("data:apps");
	cacheTag("data:model_apps");
	cacheTag(`data:model_apps:${modelId}`);

	return getModelAppsCached(modelId, false);
}

export async function fetchFrontendModelPerformance(
	modelId: string,
	windowHours = 24,
): Promise<ModelPerformanceMetrics | null> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:model-performance");
	cacheTag("data:gateway_usage_rollups");
	cacheTag(`data:gateway_usage_rollups:model:${modelId}`);
	cacheTag(`model:performance:${modelId}`);

	return getModelPerformanceMetricsCached(modelId, false, windowHours);
}

export async function fetchFrontendModelActivitySnapshot(
	modelId: string,
): Promise<ModelPerformanceActivitySnapshot | null> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:model-activity");
	cacheTag("data:gateway_usage_rollups");
	cacheTag(`data:gateway_usage_rollups:model:${modelId}`);
	cacheTag(`model:performance:${modelId}`);

	return getModelPerformanceActivitySnapshotCached(modelId, false);
}

export async function fetchFrontendModelTokenTrajectory(
	modelId: string,
): Promise<ModelTokenTrajectory | null> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:model-token-trajectory");
	cacheTag("data:gateway_usage_rollups");
	cacheTag(`data:gateway_usage_rollups:model:${modelId}`);

	return getModelTokenTrajectoryCached(modelId, false);
}

export async function fetchFrontendModelRealtimeWindowStats(
	modelId: string,
	days = 30,
): Promise<ModelRealtimeWindowStats | null> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:model-realtime-window");
	cacheTag("data:gateway_requests");
	cacheTag(`data:gateway_requests:model:${modelId}`);

	return getModelRealtimeWindowStatsCached(modelId, days);
}

export async function fetchFrontendModelProviderRuntimeStats(args: {
	modelId: string;
	providerIds: string[];
	modelAliases: string[];
}): Promise<ProviderRuntimeStatsMap> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:model-runtime-stats");
	cacheTag("data:gateway_usage_rollups");
	cacheTag("data:gateway_requests");
	cacheTag(`data:gateway_usage_rollups:model:${args.modelId}`);

	return getModelProviderRuntimeStatsCached(args);
}

export async function fetchFrontendModelProviderHealthMetrics(args: {
	modelId: string;
	providerIds: string[];
	modelAliases: string[];
	windowDays?: number;
	bucketHours?: number;
}): Promise<ProviderHealthMetricsMap> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:model-health");
	cacheTag("data:gateway_usage_rollups");
	cacheTag("data:gateway_requests");
	cacheTag(`data:gateway_usage_rollups:model:${args.modelId}`);
	cacheTag(`data:gateway_requests:model:${args.modelId}`);
	cacheTag(`model:health:${args.modelId}`);

	return getModelProviderHealthMetricsCached(args);
}

export async function fetchFrontendModelUsageDailyBreakdown(args: {
	modelId: string;
	modelAliases?: string[];
	providerIds?: string[];
	days?: number;
	since?: string;
	until?: string;
}): Promise<ModelUsageDailyBreakdownRow[]> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:model-usage-daily");
	cacheTag("data:gateway_usage_rollups");
	cacheTag("data:gateway_model_usage_daily");
	cacheTag(`data:gateway_usage_rollups:model:${args.modelId}`);
	cacheTag(`data:gateway_model_usage_daily:model:${args.modelId}`);
	cacheTag(`model:usage-daily:${args.modelId}`);

	return getModelUsageDailyBreakdownCached(args);
}

export async function fetchFrontendModelProviderRoutingHealth(args: {
	modelId: string;
	providerIds: string[];
	windowHours?: number;
}): Promise<ProviderRoutingStatusMap> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:model-routing-health");
	cacheTag("data:gateway_provider_health_states");
	cacheTag(`data:gateway_provider_health_states:model:${args.modelId}`);
	for (const providerId of args.providerIds) {
		cacheTag(`data:gateway_provider_health_states:provider:${providerId}`);
	}

	return getModelProviderRoutingHealthCached(args);
}

export async function fetchFrontendModelBenchmarkHighlights(
	modelId: string,
): Promise<ModelBenchmarkHighlight[]> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:model-benchmarks");
	cacheTag("data:benchmarks");
	cacheTag(`model:data:${modelId}`);
	cacheTag(`data:benchmarks:model:${modelId}`);
	cacheTag(`model:benchmarks:highlights:${modelId}`);

	return getModelBenchmarkHighlights(modelId, false);
}

export async function fetchFrontendAPIProviders(): Promise<APIProviderCard[]> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:api-providers");
	cacheTag("data:api_providers");
	cacheTag("data:api_providers:list");

	return getAllAPIProvidersCached();
}

export async function fetchFrontendAPIProviderHeader(
	apiProviderId: string,
): Promise<APIProviderHeader | null> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:api-providers");
	cacheTag("data:api_providers");
	cacheTag(`data:api_providers:${apiProviderId}`);
	cacheTag(`api_provider:header:${apiProviderId}`);

	return getAPIProviderHeader(apiProviderId);
}

export async function fetchFrontendAPIProviderModels(
	apiProviderId: string,
): Promise<APIProviderModelListItem[]> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:api-provider-models");
	cacheTag("data:api_providers");
	cacheTag(`data:api_providers:${apiProviderId}`);
	cacheTag(`data:top_models:provider:${apiProviderId}`);

	return getAPIProviderModelsListByModelDateCached(apiProviderId, false);
}

export async function fetchFrontendAPIProviderTopApps(
	apiProviderId: string,
	period: "day" | "week" | "month" = "day",
	count = 20,
): Promise<AppStats[]> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:api-providers");
	cacheTag("frontend:api-provider-top-apps");
	cacheTag("data:top_apps");
	cacheTag(`data:top_apps:provider:${apiProviderId}`);
	cacheTag(`data:api_providers:${apiProviderId}`);

	return getTopAppsCached(apiProviderId, period, count);
}

export async function fetchFrontendAPIProviderTopModels(
	apiProviderId: string,
	count = 6,
): Promise<ModelStats[]> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:api-providers");
	cacheTag("frontend:api-provider-top-models");
	cacheTag("data:gateway_usage_rollups");
	cacheTag(`data:gateway_usage_rollups:provider:${apiProviderId}`);
	cacheTag("data:top_models");
	cacheTag(`data:top_models:provider:${apiProviderId}`);
	cacheTag(`data:api_providers:${apiProviderId}`);

	return getTopModelsCached(apiProviderId, false, count);
}

export async function fetchFrontendAPIProviderModelTokenTimeseries(
	apiProviderId: string,
	options: { days?: number; topModels?: number } = {},
): Promise<ProviderTokenTimeseries> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:api-providers");
	cacheTag("frontend:api-provider-token-timeseries");
	cacheTag("data:gateway_usage_rollups");
	cacheTag(`data:gateway_usage_rollups:provider:${apiProviderId}`);
	cacheTag(`data:api_providers:${apiProviderId}`);

	return getProviderModelTokenTimeseries(apiProviderId, {
		days: options.days ?? 30,
		topModels: options.topModels ?? 8,
	});
}

export async function fetchFrontendAPIProviderAppTokenTimeseries(
	apiProviderId: string,
	options: { days?: number; topApps?: number } = {},
): Promise<ProviderAppTokenTimeseries> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:api-providers");
	cacheTag("frontend:api-provider-token-timeseries");
	cacheTag("data:gateway_usage_rollups");
	cacheTag(`data:gateway_usage_rollups:provider:${apiProviderId}`);
	cacheTag(`data:api_providers:${apiProviderId}`);

	return getProviderAppTokenTimeseries(apiProviderId, {
		days: options.days ?? 30,
		topApps: options.topApps ?? 20,
	});
}

export async function fetchFrontendAPIProviderMetrics(
	apiProviderId: string,
	hours = 24 * 7,
): Promise<ProviderMetrics> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:api-providers");
	cacheTag("frontend:api-provider-metrics");
	cacheTag("data:gateway_usage_rollups");
	cacheTag(`data:gateway_usage_rollups:provider:${apiProviderId}`);
	cacheTag(`data:api_providers:${apiProviderId}`);

	return getProviderMetrics(apiProviderId, hours);
}

export async function fetchFrontendAPIProviderUpdates(
	apiProviderId: string,
): Promise<APIProviderUpdates> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:api-providers");
	cacheTag("frontend:api-provider-updates");
	cacheTag("data:api_providers");
	cacheTag(`data:api_providers:${apiProviderId}`);
	cacheTag("data:data_api_provider_models");
	cacheTag(`data:data_api_provider_models:provider:${apiProviderId}`);
	cacheTag("data:gateway_usage_rollups");
	cacheTag(`data:gateway_usage_rollups:provider:${apiProviderId}`);

	return getAPIProviderUpdatesCached(apiProviderId);
}

export async function fetchFrontendOrganisations(): Promise<OrganisationCard[]> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:organisations");
	cacheTag("data:organisations");
	cacheTag("data:organisations:list");

	return getAllOrganisationsCached();
}

export async function fetchFrontendOrganisation(
	organisationId: string,
	limit = 12,
): Promise<OrganisationData | null> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:organisations");
	cacheTag("data:organisations");
	cacheTag(`data:organisations:${organisationId}`);
	cacheTag(`organisation:header:${organisationId}`);

	return getOrganisationDataCached(organisationId, limit, false);
}

export async function fetchFrontendOrganisationHeader(
	organisationId: string,
): Promise<OrganisationOverviewHeader | null> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:organisations");
	cacheTag("frontend:organisation-header");
	cacheTag("data:organisations");
	cacheTag(`data:organisations:${organisationId}`);
	cacheTag(`organisation:header:${organisationId}`);

	return getOrganisationOverviewHeader(organisationId);
}

export async function fetchFrontendOrganisationModels(
	organisationId: string,
): Promise<OrganisationModelCards[]> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:organisation-models");
	cacheTag("data:organisations");
	cacheTag("data:models");
	cacheTag(`data:organisations:${organisationId}`);

	return getOrganisationModelsCached(organisationId, false);
}

export async function fetchFrontendBenchmarks(
	sorted = false,
): Promise<BenchmarkCard[]> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:benchmarks");
	cacheTag("data:benchmarks");
	cacheTag("data:benchmarks:list");

	return getAllBenchmarksCached(sorted);
}

export async function fetchFrontendBenchmark(
	benchmarkId: string,
): Promise<BenchmarkPage | null> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:benchmarks");
	cacheTag("data:benchmarks");
	cacheTag(`data:benchmarks:${benchmarkId}`);

	return getBenchmarkCached(benchmarkId, false);
}

export async function fetchFrontendFamilies(): Promise<FamilyCard[]> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:families");
	cacheTag("data:families");

	return getAllFamiliesCached();
}

export async function fetchFrontendFamily(
	familyId: string,
): Promise<FamilyInfo | null> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:families");
	cacheTag("data:models");
	cacheTag("data:families");

	return getFamilyModelsCached(familyId, false);
}

export async function fetchFrontendSubscriptionPlans(): Promise<
	SubscriptionPlanSummary[]
> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:subscription-plans");
	cacheTag("data:subscription_plans");

	return getAllSubscriptionPlansCached();
}

export async function fetchFrontendSubscriptionPlan(
	planId: string,
): Promise<SubscriptionPlanDetails | null> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:subscription-plans");
	cacheTag("data:subscription_plans");
	cacheTag(`data:subscription_plans:${planId}`);

	return getSubscriptionPlanCached(planId, false);
}

export async function fetchFrontendCountrySummaries(): Promise<CountrySummary[]> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:countries");
	cacheTag("data:organisations");
	cacheTag("data:models");

	return getCountrySummariesCached(false);
}

export async function fetchFrontendCountry(
	iso: string,
): Promise<CountrySummary | null> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:countries");
	cacheTag("data:organisations");
	cacheTag("data:models");
	cacheTag(`frontend:countries:${iso.toUpperCase()}`);

	return (await getCountrySummaryByIsoCached(iso, false)) ?? null;
}

export async function fetchFrontendPricingModels(): Promise<PricingModel[]> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:pricing-models");
	cacheTag("data:models");
	cacheTag("data:api_providers");
	cacheTag("data:data_api_pricing_rules");

	return getPricingModelsCached(false);
}

export async function fetchFrontendMarketplacePresets(): Promise<
	MarketplacePreset[]
> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:marketplace-presets");
	cacheTag("data:presets");
	cacheTag("data:presets:public");

	return getPublicMarketplacePresetsCached();
}

export async function fetchFrontendMarketplacePresetDetail(
	presetId: string,
): Promise<MarketplacePresetDetail | null> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:marketplace-presets");
	cacheTag("data:presets");
	cacheTag("data:presets:public");
	cacheTag(`data:presets:${presetId}`);

	return getPublicMarketplacePresetDetailCached(presetId);
}

export async function fetchFrontendWebUpdates(
	limit = 100,
): Promise<UpdateCardProps[]> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:web-updates");
	cacheTag("data:latest-web-updates");

	return getWebUpdatesCached(limit);
}

export async function fetchFrontendYouTubeUpdates(
	limit = 100,
): Promise<UpdateCardProps[]> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:youtube-updates");
	cacheTag("data:latest-youtube-updates");

	return getYouTubeUpdatesCached(limit);
}

export async function fetchFrontendUpdateCards(
	limit = 5,
): Promise<UpdateCardProps[]> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:update-cards");
	cacheTag("data:latest-updates");
	cacheTag("data:latest-web-updates");
	cacheTag("data:latest-youtube-updates");

	return getLatestUpdateCards(limit);
}

export async function fetchFrontendModelUpdateCards(
	limit = 5,
	includeHidden = false,
): Promise<ModelUpdateCardProps[]> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:model-update-cards");
	cacheTag("frontend:model-updates");
	cacheTag("data:model-updates");
	cacheTag("data:models");

	return getLatestModelUpdateCards(limit, includeHidden);
}

export async function fetchFrontendSignInSupportedModelsStats(
	includeHidden = false,
): Promise<SupportedModelsStats> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("data:sign-in:supported-models-stats");
	cacheTag("frontend:sign-in-supported-models-stats");
	cacheTag("data:models");
	cacheTag("data:organisations");
	cacheTag("data:data_api_provider_models");

	return getSupportedModelsStatsCached(includeHidden);
}

export async function fetchFrontendSignInMainModels(
	modelIds: string[],
	includeHidden = false,
): Promise<SignInModel[]> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("data:sign-in:models");
	cacheTag("frontend:sign-in-main-models");
	cacheTag("data:models");
	cacheTag("data:organisations");

	return getMainModelsCached(modelIds, includeHidden);
}

export async function fetchFrontendModelUpdates(args: {
	limit?: number;
	upcomingLimit?: number;
	includeAllPast?: boolean;
} = {}): Promise<ModelEventSegments> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:model-updates");
	cacheTag("data:model-updates");
	cacheTag("data:models");

	return getRecentModelUpdatesSplit(args);
}

export async function fetchFrontendOrganisationReleaseEvents(
	organisationId: string,
): Promise<ModelEvent[]> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:model-updates");
	cacheTag("data:model-updates");
	cacheTag("data:models");
	cacheTag(`data:model-updates:organisation:${organisationId}`);

	return getOrganisationReleaseEvents(organisationId);
}

export async function fetchFrontendPublicAppIds(): Promise<string[]> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:apps");
	cacheTag("data:public_apps");

	return getPublicAppIdsCached();
}

export async function fetchFrontendAppDetails(
	appId: string,
): Promise<AppDetails | null> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:apps");
	cacheTag("frontend:app-details");
	cacheTag("data:app_details");
	cacheTag(`data:app_details:${appId}`);

	return getAppDetailsCached(appId);
}

export async function fetchFrontendPublicProfile(
	slug: string,
): Promise<ProfileSnapshot | null> {
	"use cache";

	cacheLife("minutes");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:profile");
	cacheTag(`frontend:profile:${slug}`);
	cacheTag("data:profiles");

	return getPublicProfileSnapshot(slug);
}

export async function fetchFrontendOgPayload(
	kind: OgEntity,
	segments: string[],
): Promise<OgPayload | null> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("og:payload");
	cacheTag("frontend:og-payload");

	return getFrontendOgPayload(kind, segments);
}

export async function fetchFrontendAppUsage(
	appId: string,
	range: RangeKey = "4w",
): Promise<AppUsageRow[]> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:apps");
	cacheTag("frontend:app-usage");
	cacheTag("data:app_usage");
	cacheTag(`data:app_usage:${appId}`);
	cacheTag(`data:app_usage:${appId}:${range}`);

	if (!(await isPublicAppId(appId))) return [];
	return getAppUsageOverTime(appId, range);
}

export async function fetchFrontendRecentAppRequests(
	appId: string,
	limit = 10,
): Promise<AppUsageRow[]> {
	"use cache";

	cacheLife("minutes");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:apps");
	cacheTag("frontend:app-usage");
	cacheTag("data:app_usage");
	cacheTag(`data:app_usage:${appId}`);
	cacheTag(`data:app_usage:${appId}:recent`);

	if (!(await isPublicAppId(appId))) return [];
	return getRecentAppRequests(appId, limit);
}

export async function fetchFrontendAppImageUrls(
	appIds: string[],
): Promise<Record<string, string | null>> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:apps");
	cacheTag("frontend:app-images");
	cacheTag("data:apps");

	return getAppImageUrlsByIds(appIds);
}

export async function fetchFrontendTopApps(
	timeRange = "week",
	limit = 20,
): Promise<{ data: TopAppData[] }> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:apps");
	cacheTag("frontend:app-rankings");
	cacheTag("public-top-apps");

	return getTopApps(timeRange, limit);
}

export async function fetchFrontendTrendingApps(
	limit = 20,
	minWeekTokens = 0,
): Promise<{ data: TrendingAppData[] }> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:apps");
	cacheTag("frontend:app-rankings");
	cacheTag("public-top-apps");

	return getTrendingApps(limit, minWeekTokens);
}

export async function fetchFrontendAppsIndexability(): Promise<AppsIndexabilitySnapshot> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:apps");
	cacheTag("frontend:app-rankings");
	cacheTag("public-top-apps");
	cacheTag("data:public_apps");

	return getAppsIndexabilitySnapshot();
}

export async function fetchFrontendAppProviderModelMappings(
	appId: string,
	apiLookupIds: string[],
	providerIds: string[],
): Promise<ProviderModelMapping[]> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:apps");
	cacheTag("frontend:app-provider-model-mappings");
	cacheTag("data:models");
	cacheTag("data:data_api_provider_models");
	cacheTag(`data:app_usage:${appId}`);

	if (apiLookupIds.length === 0) return [];

	const supabase = createAdminClient();
	let query = supabase
		.from("data_api_provider_models")
		.select("provider_id, api_model_id, model_id")
		.in("api_model_id", apiLookupIds)
		.not("model_id", "is", null);

	if (providerIds.length > 0) {
		query = query.in("provider_id", providerIds);
	}

	const { data, error } = await query;
	if (error) {
		throw new Error(`Failed to load provider model mappings: ${error.message}`);
	}

	return (data ?? []) as ProviderModelMapping[];
}

export async function fetchFrontendModelLeaderboardMetaByIds(
	modelIds: string[],
): Promise<Record<string, ModelLeaderboardMeta>> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:models");
	cacheTag("frontend:model-leaderboard-meta");
	cacheTag("data:models");

	return getModelLeaderboardMetaByIds(modelIds);
}

export async function fetchFrontendRankingPerformance(
	hours = 24,
): Promise<{ data: PerformanceData[] }> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:rankings");
	cacheTag("frontend:rankings-performance");
	cacheTag("public-performance");

	return getPerformanceData(hours);
}

export async function fetchFrontendRankingsIndexability(): Promise<RankingsIndexabilitySnapshot> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:rankings");
	cacheTag("frontend:rankings-indexability");
	cacheTag("public-rankings");
	cacheTag("public-performance");
	cacheTag("public-timeseries");
	cacheTag("public-top-apps");

	return getRankingsIndexabilitySnapshot();
}

export async function fetchFrontendMarketShare(
	dimension: "organization" | "provider" = "organization",
	timeRange = "week",
): Promise<{ data: MarketShareData[] }> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:rankings");
	cacheTag("frontend:rankings-market-share");
	cacheTag("public-market-share");

	return getMarketShare(dimension, timeRange);
}

export async function fetchFrontendMarketShareTimeseries(
	dimension: "organization" | "provider" = "organization",
	timeRange = "week",
	bucketSize = "day",
	topN = 8,
): Promise<{ data: MarketShareTimeseriesData[] }> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:rankings");
	cacheTag("frontend:rankings-market-share-timeseries");
	cacheTag("public-market-share-timeseries");

	return getMarketShareTimeseries(dimension, timeRange, bucketSize, topN);
}

export async function fetchFrontendRankingTimeseries(
	timeRange = "week",
	bucketSize = "hour",
	topN = 10,
): Promise<{ data: TimeseriesData[] }> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:rankings");
	cacheTag("frontend:rankings-timeseries");
	cacheTag("public-timeseries");

	return getTimeseriesData(timeRange, bucketSize, topN);
}

export async function fetchFrontendRankingMultimodal(
	timeRange = "week",
): Promise<{ data: MultimodalData[] }> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:rankings");
	cacheTag("frontend:rankings-multimodal");
	cacheTag("public-multimodal");

	return getMultimodalBreakdown(timeRange);
}

export async function fetchFrontendModelRankings(
	timeRange = "week",
	metric = "tokens",
	limit = 50,
): Promise<RankingsResponse> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:rankings");
	cacheTag("frontend:model-rankings");
	cacheTag("public-rankings");

	return getRankings(timeRange, metric, limit);
}

export async function fetchFrontendModelNamesByIds(
	modelIds: string[],
): Promise<Record<string, string>> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:rankings");
	cacheTag("frontend:model-names");
	cacheTag("data:models");

	return getModelNamesByIds(modelIds);
}

export async function fetchFrontendProviderNamesByIds(
	providerIds: string[],
): Promise<Record<string, string>> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:rankings");
	cacheTag("frontend:provider-names");
	cacheTag("data:api_providers");

	return getProviderNamesByIds(providerIds);
}

export async function fetchFrontendProviderMetaByIds(
	providerIds: string[],
): Promise<Record<string, ProviderMeta>> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:rankings");
	cacheTag("frontend:provider-meta");
	cacheTag("data:api_providers");

	return getProviderMetaByIds(providerIds);
}

export async function fetchFrontendOrganisationLogoIdsByNames(
	names: string[],
): Promise<Record<string, string>> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:rankings");
	cacheTag("frontend:organisation-logo-ids");
	cacheTag("data:organisations");

	return getOrganisationLogoIdsByNames(names);
}

export async function fetchFrontendCompareModels(): Promise<ExtendedModel[]> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:compare-models");
	cacheTag("data:models");

	return loadCompareModelsCached(false);
}

export async function fetchFrontendComparisonModels(
	modelIds: string[],
): Promise<ExtendedModel[]> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:compare-models");
	cacheTag("frontend:comparison-models");
	cacheTag("data:models");
	cacheTag("data:data_api_pricing_rules");
	cacheTag("data:subscription_plans");
	for (const modelId of modelIds) {
		cacheTag(`data:models:${modelId}`);
		cacheTag(`model:data:${modelId}`);
		cacheTag(`model:api:${modelId}`);
	}

	return getComparisonModelsCached(modelIds, false);
}
