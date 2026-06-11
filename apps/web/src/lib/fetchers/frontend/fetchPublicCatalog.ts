import { cacheLife, cacheTag } from "next/cache";
import { absoluteUrl } from "@/lib/seo";
import type { AppDetails } from "@/lib/fetchers/apps/getAppDetails";
import {
	getAppDetailsCached,
	getPublicAppIdsCached,
} from "@/lib/fetchers/apps/getAppDetails";
import type { ProfileSnapshot } from "@/lib/fetchers/profile/getProfileSnapshot";
import type {
	OgEntity,
	OgPayload,
} from "@/lib/fetchers/frontend/getOgPayload";
import type { SignInModel } from "@/lib/fetchers/landing/sign-in/getMainModels";
import type { SupportedModelsStats } from "@/lib/fetchers/landing/sign-in/getSupportedModelsStats";
import type {
	AppUsageRow,
	RangeKey,
} from "@/lib/fetchers/apps/getAppUsageOverTime";
import type { ExtendedModel } from "@/data/types";
import type { APIProviderCard } from "@/lib/fetchers/api-providers/getAllAPIProviders";
import { getAllAPIProvidersCached } from "@/lib/fetchers/api-providers/getAllAPIProviders";
import type { APIProviderHeader } from "@/lib/fetchers/api-providers/getAPIProviderHeader";
import type { APIProviderModelListItem } from "@/lib/fetchers/api-providers/getAPIProvider";
import type { ProviderAppTokenTimeseries } from "@/lib/fetchers/api-providers/api-provider/providerAppTokenTimeseries";
import type { ProviderTokenTimeseries } from "@/lib/fetchers/api-providers/api-provider/providerTokenTimeseries";
import type { AppStats } from "@/lib/fetchers/api-providers/api-provider/top-apps";
import type { ModelStats } from "@/lib/fetchers/api-providers/api-provider/top-models";
import type { ProviderMetrics } from "@/lib/fetchers/api-providers/getProviderMetrics";
import type { APIProviderUpdates } from "@/lib/fetchers/api-providers/getAPIProviderUpdates";
import type { BenchmarkCard } from "@/lib/fetchers/benchmarks/getAllBenchmarks";
import { getAllBenchmarksCached } from "@/lib/fetchers/benchmarks/getAllBenchmarks";
import type { BenchmarkPage } from "@/lib/fetchers/benchmarks/getBenchmark";
import { getBenchmarkCached } from "@/lib/fetchers/benchmarks/getBenchmark";
import type { CountrySummary } from "@/lib/fetchers/countries/getCountrySummaries";
import { getCountrySummariesCached } from "@/lib/fetchers/countries/getCountrySummaries";
import { getCountrySummaryByIsoCached } from "@/lib/fetchers/countries/getCountrySummary";
import { loadCompareModelsCached } from "@/lib/fetchers/compare/loadCompareModels";
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
import type { ModelAppUsage } from "@/lib/fetchers/models/getModelApps";
import type { ModelBenchmarkHighlight } from "@/lib/fetchers/models/getModelBenchmarkData";
import type { ModelGatewayMetadata } from "@/lib/fetchers/models/getModelGatewayMetadata";
import type { FreeRouterOverview } from "@/lib/fetchers/models/getFreeRouterOverview";
import { getFreeRouterOverview } from "@/lib/fetchers/models/getFreeRouterOverview";
import type { ModelOverviewHeader } from "@/lib/fetchers/models/getModelOverviewHeader";
import type { ModelPageNotice } from "@/lib/fetchers/models/getModelPageNotice";
import type { ModelPendingApiReleaseState } from "@/lib/fetchers/models/getModelPendingApiReleaseState";
import type {
	ModelPerformanceActivitySnapshot,
	ModelPerformanceMetrics,
} from "@/lib/fetchers/models/getModelPerformance";
import type { ProviderPricing } from "@/lib/fetchers/models/getModelPricing";
import type { ModelPricingHistoryRule } from "@/lib/fetchers/models/getModelPricingHistoryRules";
import type {
	ProviderHealthMetricsMap,
	ProviderRuntimeStatsMap,
} from "@/lib/fetchers/models/getModelProviderRuntimeStats";
import type { ModelUsageDailyBreakdownRow } from "@/lib/fetchers/models/getModelUsageDailyBreakdown";
import type { ProviderRoutingStatusMap } from "@/lib/fetchers/models/getModelProviderRoutingHealth";
import type { ModelRealtimeWindowStats } from "@/lib/fetchers/models/getModelRealtimeWindowStats";
import type { SubscriptionPlan } from "@/lib/fetchers/models/getModelSubscriptionPlans";
import type { RawEvent } from "@/lib/fetchers/models/getModelTimeline";
import type { ModelTokenTrajectory } from "@/lib/fetchers/models/getModelTokenTrajectory";
import type { FamilyInfo } from "@/lib/fetchers/models/getFamilyModels";
import { getFamilyModelsCached } from "@/lib/fetchers/models/getFamilyModels";
import type { ModelCard } from "@/lib/fetchers/models/getAllModels";
import { getFrontendModelsPayload } from "@/lib/fetchers/frontend/getFrontendModelsPayload";
import type { ModelOverviewPage } from "@/lib/fetchers/models/getModel";
import type { MonitorModelData } from "@/lib/fetchers/models/table-view/getMonitorModels";
import { getMonitorModels } from "@/lib/fetchers/models/table-view/getMonitorModels";
import type { ResolveCanonicalModelIdResult } from "@/lib/fetchers/models/resolveCanonicalModelId";
import type { OrganisationCard } from "@/lib/fetchers/organisations/getAllOrganisations";
import { getAllOrganisationsCached } from "@/lib/fetchers/organisations/getAllOrganisations";
import type {
	OrganisationData,
	OrganisationModelCards,
} from "@/lib/fetchers/organisations/getOrganisation";
import type { OrganisationOverviewHeader } from "@/lib/fetchers/organisations/getOrganisationOverviewHeader";
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
	getOrganisationLogoIdsByNames,
	getPerformanceData,
	getProviderMetaByIds,
	getProviderNamesByIds,
	getRankings,
	getRankingsIndexabilitySnapshot,
	getTimeseriesData,
	getTopApps,
	getTrendingApps,
} from "@/lib/fetchers/rankings/getRankingsData";
import type { UpdateCardProps } from "@/lib/fetchers/updates/getLatestUpdates";
import { getLatestUpdateCards } from "@/lib/fetchers/updates/getLatestUpdates";
import type { UpdateCardProps as ModelUpdateCardProps } from "@/lib/fetchers/updates/getLatestModelUpdates";
import { getLatestModelUpdateCards } from "@/lib/fetchers/updates/getLatestModelUpdates";
import type {
	ModelEvent,
	ModelEventSegments,
} from "@/lib/fetchers/updates/getModelUpdates";
import { getRecentModelUpdatesSplit } from "@/lib/fetchers/updates/getModelUpdates";
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
import type { FrontendLandingStats } from "@/app/api/frontend/landing/stats/route";
import type { FrontendGatewayShowcaseData } from "@/app/api/frontend/landing/gateway-showcase/route";

export type ProviderModelMapping = {
	provider_id: string | null;
	api_model_id: string | null;
	model_id: string | null;
};

async function fetchFrontendJson<T>(path: string): Promise<T> {
	const response = await fetch(absoluteUrl(path), {
		headers: { accept: "application/json" },
		next: { tags: ["public-model-catalogue"] },
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch ${path}: ${response.status}`);
	}

	return (await response.json()) as T;
}

function isProductionBuild() {
	return (
		process.env.NEXT_PHASE === "phase-production-build" ||
		(process.env.NODE_ENV === "production" &&
			process.env.NEXT_RUNTIME === undefined)
	);
}

function shouldUseDirectFallback(error: unknown): boolean {
	if (isProductionBuild()) return true;
	const candidate = error as {
		message?: unknown;
		cause?: { code?: unknown; errors?: Array<{ code?: unknown }> };
	};
	if (String(candidate?.message ?? "").includes("fetch failed")) return true;
	if (candidate?.cause?.code === "ECONNREFUSED") return true;
	return Boolean(
		candidate?.cause?.errors?.some((item) => item?.code === "ECONNREFUSED"),
	);
}

function encodePathSegment(value: string): string {
	return encodeURIComponent(value);
}

function encodePathSegments(value: string): string {
	return value
		.split("/")
		.filter(Boolean)
		.map((segment) => encodeURIComponent(segment))
		.join("/");
}

function modelFrontendPath(modelId: string, suffix: string): string {
	return `/api/frontend/models/${encodePathSegments(modelId)}/${suffix}`;
}

function appendListParam(
	params: URLSearchParams,
	key: string,
	values: string[],
) {
	for (const value of values) {
		const trimmed = value.trim();
		if (trimmed) params.append(key, trimmed);
	}
}

export async function fetchFrontendModels(): Promise<ModelCard[]> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:models");
	cacheTag("data:models");
	cacheTag("models:list-base");

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

	try {
		return await fetchFrontendJson<ModelCollection[]>(
			`/api/frontend/models/collections?limit=${limit}`,
		);
	} catch (error) {
		if (!shouldUseDirectFallback(error)) throw error;
		return getModelCollections(limit);
	}
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

	try {
		return await fetchFrontendJson<FrontendMonitorModelsResult>(
			"/api/frontend/models/monitor",
		);
	} catch (error) {
		if (!shouldUseDirectFallback(error)) throw error;
		return getMonitorModels({}, false);
	}
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

	try {
		return await fetchFrontendJson<FreeRouterOverview>(
			"/api/frontend/models/free-router",
		);
	} catch (error) {
		if (!shouldUseDirectFallback(error)) throw error;
		return getFreeRouterOverview();
	}
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

	return fetchFrontendJson<FrontendLandingStats>("/api/frontend/landing/stats");
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

	const params = new URLSearchParams({
		topModelsLimit: String(args.topModelsLimit ?? 6),
		topAppsLimit: String(args.topAppsLimit ?? 25),
	});
	return fetchFrontendJson<FrontendGatewayShowcaseData>(
		`/api/frontend/landing/gateway-showcase?${params.toString()}`,
	);
}

function appendOptionalParam(
	params: URLSearchParams,
	key: string,
	value: string | number | undefined,
) {
	if (value === undefined || value === null || value === "") return;
	params.set(key, String(value));
}

export async function fetchFrontendMonitorHistoryInitialData(): Promise<MonitorHistoryInitialData> {
	"use cache";

	cacheLife("minutes");
	cacheTag("public-model-catalogue");
	cacheTag("monitor-history");
	cacheTag("frontend:monitor-history");

	try {
		return await fetchFrontendJson<MonitorHistoryInitialData>(
			"/api/frontend/monitor/history",
		);
	} catch (error) {
		if (!shouldUseDirectFallback(error)) throw error;
		return getMonitorHistoryInitialData();
	}
}

export async function fetchFrontendMonitorHistoryPage(
	filters: MonitorHistoryPageFilters = {},
): Promise<MonitorHistoryDbPage> {
	"use cache";

	cacheLife("minutes");
	cacheTag("public-model-catalogue");
	cacheTag("monitor-history");
	cacheTag("frontend:monitor-history");

	const params = new URLSearchParams();
	appendOptionalParam(params, "changeType", filters.changeType);
	appendOptionalParam(params, "commitLimit", filters.commitLimit);
	appendOptionalParam(params, "commitOffset", filters.commitOffset);
	appendOptionalParam(params, "model", filters.model);
	appendOptionalParam(params, "provider", filters.provider);
	const query = params.toString();

	try {
		return await fetchFrontendJson<MonitorHistoryDbPage>(
			`/api/frontend/monitor/history${query ? `?${query}` : ""}`,
		);
	} catch (error) {
		if (!shouldUseDirectFallback(error)) throw error;
		return fetchMonitorHistoryPageFromDb(filters);
	}
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

	return fetchFrontendJson<ModelOverviewPage | null>(
		modelFrontendPath(modelId, "overview"),
	);
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

	return fetchFrontendJson<ModelOverviewHeader | null>(
		`${modelFrontendPath(modelId, "header")}?includeHidden=${includeHidden ? "1" : "0"}`,
	);
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
	cacheTag(`model:notice:resolve:${modelId}`);

	return fetchFrontendJson<ModelPageNotice | null>(
		`${modelFrontendPath(modelId, "notice")}?includeHidden=${includeHidden ? "1" : "0"}`,
	);
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

	return fetchFrontendJson<ResolveCanonicalModelIdResult>(
		`${modelFrontendPath(modelId, "canonical")}?includeHidden=${includeHidden ? "1" : "0"}`,
	);
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

	return fetchFrontendJson<ModelPendingApiReleaseState>(
		`${modelFrontendPath(modelId, "pending-api-release")}?includeHidden=${includeHidden ? "1" : "0"}`,
	);
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

	return fetchFrontendJson<ProviderPricing[]>(
		modelFrontendPath(modelId, "pricing"),
	);
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

	const params = new URLSearchParams({
		includeHidden: options.includeHidden ? "1" : "0",
		days: String(options.days ?? 30),
	});
	return fetchFrontendJson<ModelPricingHistoryRule[]>(
		`${modelFrontendPath(modelId, "pricing-history")}?${params.toString()}`,
	);
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

	return fetchFrontendJson<SubscriptionPlan[]>(
		modelFrontendPath(modelId, "subscription-plans"),
	);
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

	return fetchFrontendJson<ModelGatewayMetadata>(
		modelFrontendPath(modelId, "gateway-metadata"),
	);
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

	return fetchFrontendJson<{ events: RawEvent[] } | null>(
		modelFrontendPath(modelId, "timeline"),
	);
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

	return fetchFrontendJson<ModelAppUsage[]>(modelFrontendPath(modelId, "apps"));
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

	return fetchFrontendJson<ModelPerformanceMetrics | null>(
		`${modelFrontendPath(modelId, "performance")}?windowHours=${windowHours}`,
	);
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

	return fetchFrontendJson<ModelPerformanceActivitySnapshot | null>(
		modelFrontendPath(modelId, "activity"),
	);
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

	return fetchFrontendJson<ModelTokenTrajectory | null>(
		modelFrontendPath(modelId, "token-trajectory"),
	);
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

	return fetchFrontendJson<ModelRealtimeWindowStats | null>(
		`${modelFrontendPath(modelId, "realtime-window")}?days=${days}`,
	);
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

	const params = new URLSearchParams();
	appendListParam(params, "providerId", args.providerIds);
	appendListParam(params, "modelAlias", args.modelAliases);
	const query = params.toString();

	return fetchFrontendJson<ProviderRuntimeStatsMap>(
		`${modelFrontendPath(args.modelId, "runtime-stats")}${query ? `?${query}` : ""}`,
	);
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

	const params = new URLSearchParams({
		windowDays: String(args.windowDays ?? 30),
		bucketHours: String(args.bucketHours ?? 24),
	});
	appendListParam(params, "providerId", args.providerIds);
	appendListParam(params, "modelAlias", args.modelAliases);

	return fetchFrontendJson<ProviderHealthMetricsMap>(
		`${modelFrontendPath(args.modelId, "health")}?${params.toString()}`,
	);
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

	const params = new URLSearchParams({
		days: String(args.days ?? 30),
	});
	if (args.since) params.set("since", args.since);
	if (args.until) params.set("until", args.until);
	appendListParam(params, "providerId", args.providerIds ?? []);
	appendListParam(params, "modelAlias", args.modelAliases ?? []);

	return fetchFrontendJson<ModelUsageDailyBreakdownRow[]>(
		`${modelFrontendPath(args.modelId, "usage-daily")}?${params.toString()}`,
	);
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

	const params = new URLSearchParams({
		windowHours: String(args.windowHours ?? 24),
	});
	appendListParam(params, "providerId", args.providerIds);

	return fetchFrontendJson<ProviderRoutingStatusMap>(
		`${modelFrontendPath(args.modelId, "routing-health")}?${params.toString()}`,
	);
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

	return fetchFrontendJson<ModelBenchmarkHighlight[]>(
		modelFrontendPath(modelId, "benchmark-highlights"),
	);
}

export async function fetchFrontendAPIProviders(): Promise<APIProviderCard[]> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:api-providers");
	cacheTag("data:api_providers");
	cacheTag("data:api_providers:list");

	try {
		return await fetchFrontendJson<APIProviderCard[]>("/api/frontend/api-providers");
	} catch (error) {
		if (!shouldUseDirectFallback(error)) throw error;
		return getAllAPIProvidersCached();
	}
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

	return fetchFrontendJson<APIProviderHeader | null>(
		`/api/frontend/api-providers/${encodePathSegment(apiProviderId)}/header`,
	);
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

	return fetchFrontendJson<APIProviderModelListItem[]>(
		`/api/frontend/api-providers/${encodePathSegment(apiProviderId)}/models`,
	);
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

	const params = new URLSearchParams({
		period,
		count: String(count),
	});
	return fetchFrontendJson<AppStats[]>(
		`/api/frontend/api-providers/${encodePathSegment(
			apiProviderId,
		)}/top-apps?${params.toString()}`,
	);
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

	const params = new URLSearchParams({ count: String(count) });
	return fetchFrontendJson<ModelStats[]>(
		`/api/frontend/api-providers/${encodePathSegment(
			apiProviderId,
		)}/top-models?${params.toString()}`,
	);
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

	const params = new URLSearchParams({
		days: String(options.days ?? 30),
		topModels: String(options.topModels ?? 8),
	});
	return fetchFrontendJson<ProviderTokenTimeseries>(
		`/api/frontend/api-providers/${encodePathSegment(
			apiProviderId,
		)}/model-token-timeseries?${params.toString()}`,
	);
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

	const params = new URLSearchParams({
		days: String(options.days ?? 30),
		topApps: String(options.topApps ?? 20),
	});
	return fetchFrontendJson<ProviderAppTokenTimeseries>(
		`/api/frontend/api-providers/${encodePathSegment(
			apiProviderId,
		)}/app-token-timeseries?${params.toString()}`,
	);
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

	return fetchFrontendJson<ProviderMetrics>(
		`/api/frontend/api-providers/${encodePathSegment(
			apiProviderId,
		)}/metrics?hours=${hours}`,
	);
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

	return fetchFrontendJson<APIProviderUpdates>(
		`/api/frontend/api-providers/${encodePathSegment(apiProviderId)}/updates`,
	);
}

export async function fetchFrontendOrganisations(): Promise<OrganisationCard[]> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:organisations");
	cacheTag("data:organisations");
	cacheTag("data:organisations:list");

	try {
		return await fetchFrontendJson<OrganisationCard[]>(
			"/api/frontend/organisations",
		);
	} catch (error) {
		if (!shouldUseDirectFallback(error)) throw error;
		return getAllOrganisationsCached();
	}
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

	return fetchFrontendJson<OrganisationData | null>(
		`/api/frontend/organisations/${encodePathSegment(
			organisationId,
		)}?limit=${limit}`,
	);
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

	return fetchFrontendJson<OrganisationOverviewHeader | null>(
		`/api/frontend/organisations/${encodePathSegment(organisationId)}/header`,
	);
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

	return fetchFrontendJson<OrganisationModelCards[]>(
		`/api/frontend/organisations/${encodePathSegment(organisationId)}/models`,
	);
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

	const query = sorted ? "?sorted=true" : "";
	try {
		return await fetchFrontendJson<BenchmarkCard[]>(
			`/api/frontend/benchmarks${query}`,
		);
	} catch (error) {
		if (!shouldUseDirectFallback(error)) throw error;
		return getAllBenchmarksCached(sorted);
	}
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

	try {
		return await fetchFrontendJson<BenchmarkPage | null>(
			`/api/frontend/benchmarks/${encodePathSegment(benchmarkId)}`,
		);
	} catch (error) {
		if (!shouldUseDirectFallback(error)) throw error;
		return getBenchmarkCached(benchmarkId, false);
	}
}

export async function fetchFrontendFamilies(): Promise<FamilyCard[]> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:families");
	cacheTag("data:families");

	try {
		return await fetchFrontendJson<FamilyCard[]>("/api/frontend/families");
	} catch (error) {
		if (!shouldUseDirectFallback(error)) throw error;
		return getAllFamiliesCached();
	}
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

	try {
		return await fetchFrontendJson<FamilyInfo | null>(
			`/api/frontend/families/${encodePathSegments(familyId)}`,
		);
	} catch (error) {
		if (!shouldUseDirectFallback(error)) throw error;
		return getFamilyModelsCached(familyId, false);
	}
}

export async function fetchFrontendSubscriptionPlans(): Promise<
	SubscriptionPlanSummary[]
> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:subscription-plans");
	cacheTag("data:subscription_plans");

	try {
		return await fetchFrontendJson<SubscriptionPlanSummary[]>(
			"/api/frontend/subscription-plans",
		);
	} catch (error) {
		if (!shouldUseDirectFallback(error)) throw error;
		return getAllSubscriptionPlansCached();
	}
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

	try {
		return await fetchFrontendJson<SubscriptionPlanDetails | null>(
			`/api/frontend/subscription-plans/${encodePathSegment(planId)}`,
		);
	} catch (error) {
		if (!shouldUseDirectFallback(error)) throw error;
		return getSubscriptionPlanCached(planId, false);
	}
}

export async function fetchFrontendCountrySummaries(): Promise<CountrySummary[]> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:countries");
	cacheTag("data:organisations");
	cacheTag("data:models");

	try {
		return await fetchFrontendJson<CountrySummary[]>("/api/frontend/countries");
	} catch (error) {
		if (!shouldUseDirectFallback(error)) throw error;
		return getCountrySummariesCached(false);
	}
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

	try {
		return await fetchFrontendJson<CountrySummary | null>(
			`/api/frontend/countries/${encodePathSegment(iso)}`,
		);
	} catch (error) {
		if (!shouldUseDirectFallback(error)) throw error;
		return (await getCountrySummaryByIsoCached(iso, false)) ?? null;
	}
}

export async function fetchFrontendPricingModels(): Promise<PricingModel[]> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:pricing-models");
	cacheTag("data:models");
	cacheTag("data:api_providers");
	cacheTag("data:data_api_pricing_rules");

	try {
		return await fetchFrontendJson<PricingModel[]>("/api/frontend/pricing/models");
	} catch (error) {
		if (!shouldUseDirectFallback(error)) throw error;
		return getPricingModelsCached(false);
	}
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

	try {
		return await fetchFrontendJson<MarketplacePreset[]>(
			"/api/frontend/gateway/marketplace/presets",
		);
	} catch (error) {
		if (!shouldUseDirectFallback(error)) throw error;
		return getPublicMarketplacePresetsCached();
	}
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

	try {
		return await fetchFrontendJson<MarketplacePresetDetail | null>(
			`/api/frontend/gateway/marketplace/presets/${encodePathSegment(presetId)}`,
		);
	} catch (error) {
		if (!shouldUseDirectFallback(error)) throw error;
		return getPublicMarketplacePresetDetailCached(presetId);
	}
}

export async function fetchFrontendWebUpdates(
	limit = 100,
): Promise<UpdateCardProps[]> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:web-updates");
	cacheTag("data:latest-web-updates");

	try {
		return await fetchFrontendJson<UpdateCardProps[]>(
			`/api/frontend/updates/web?limit=${limit}`,
		);
	} catch (error) {
		if (!shouldUseDirectFallback(error)) throw error;
		return getWebUpdatesCached(limit);
	}
}

export async function fetchFrontendYouTubeUpdates(
	limit = 100,
): Promise<UpdateCardProps[]> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:youtube-updates");
	cacheTag("data:latest-youtube-updates");

	try {
		return await fetchFrontendJson<UpdateCardProps[]>(
			`/api/frontend/updates/youtube?limit=${limit}`,
		);
	} catch (error) {
		if (!shouldUseDirectFallback(error)) throw error;
		return getYouTubeUpdatesCached(limit);
	}
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

	try {
		return await fetchFrontendJson<UpdateCardProps[]>(
			`/api/frontend/updates/cards?limit=${limit}`,
		);
	} catch (error) {
		if (!shouldUseDirectFallback(error)) throw error;
		return getLatestUpdateCards(limit);
	}
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

	const params = new URLSearchParams({
		limit: String(limit),
		includeHidden: String(includeHidden),
	});
	try {
		return await fetchFrontendJson<ModelUpdateCardProps[]>(
			`/api/frontend/updates/model-cards?${params.toString()}`,
		);
	} catch (error) {
		if (!shouldUseDirectFallback(error)) throw error;
		return getLatestModelUpdateCards(limit, includeHidden);
	}
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

	return fetchFrontendJson<SupportedModelsStats>(
		`/api/frontend/sign-in/supported-models-stats?includeHidden=${includeHidden ? "1" : "0"}`,
	);
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

	const params = new URLSearchParams({
		includeHidden: includeHidden ? "1" : "0",
	});
	appendListParam(params, "modelId", modelIds);

	return fetchFrontendJson<SignInModel[]>(
		`/api/frontend/sign-in/main-models?${params.toString()}`,
	);
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

	const params = new URLSearchParams({
		limit: String(args.limit ?? 5),
		upcomingLimit: String(args.upcomingLimit ?? 5),
		includeAllPast: String(Boolean(args.includeAllPast)),
	});
	try {
		return await fetchFrontendJson<ModelEventSegments>(
			`/api/frontend/updates/models?${params.toString()}`,
		);
	} catch (error) {
		if (!shouldUseDirectFallback(error)) throw error;
		return getRecentModelUpdatesSplit(args);
	}
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

	return fetchFrontendJson<ModelEvent[]>(
		`/api/frontend/updates/organisations/${encodePathSegment(
			organisationId,
		)}/releases`,
	);
}

export async function fetchFrontendPublicAppIds(): Promise<string[]> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:apps");
	cacheTag("data:public_apps");

	try {
		return await fetchFrontendJson<string[]>("/api/frontend/apps/public-ids");
	} catch (error) {
		if (!shouldUseDirectFallback(error)) throw error;
		return getPublicAppIdsCached();
	}
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

	try {
		return await fetchFrontendJson<AppDetails | null>(
			`/api/frontend/apps/${encodePathSegment(appId)}`,
		);
	} catch (error) {
		if (!shouldUseDirectFallback(error)) throw error;
		return getAppDetailsCached(appId);
	}
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

	return fetchFrontendJson<ProfileSnapshot | null>(
		`/api/frontend/profile/${encodePathSegment(slug)}`,
	);
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

	const encodedSegments = segments
		.filter(Boolean)
		.map((segment) => encodePathSegment(segment))
		.join("/");
	const suffix = encodedSegments ? `/${encodedSegments}` : "";

	return fetchFrontendJson<OgPayload | null>(
		`/api/frontend/og/${encodePathSegment(kind)}${suffix}`,
	);
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

	return fetchFrontendJson<AppUsageRow[]>(
		`/api/frontend/apps/${encodePathSegment(appId)}/usage?range=${range}`,
	);
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

	return fetchFrontendJson<AppUsageRow[]>(
		`/api/frontend/apps/${encodePathSegment(appId)}/recent-requests?limit=${limit}`,
	);
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

	const params = new URLSearchParams();
	appendListParam(params, "id", appIds);
	const query = params.toString();

	try {
		return await fetchFrontendJson<Record<string, string | null>>(
			`/api/frontend/apps/images${query ? `?${query}` : ""}`,
		);
	} catch (error) {
		if (!shouldUseDirectFallback(error)) throw error;
		return getAppImageUrlsByIds(appIds);
	}
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

	const params = new URLSearchParams({
		timeRange,
		limit: String(limit),
	});
	try {
		return await fetchFrontendJson<{ data: TopAppData[] }>(
			`/api/frontend/apps/rankings/top?${params.toString()}`,
		);
	} catch (error) {
		if (!shouldUseDirectFallback(error)) throw error;
		return getTopApps(timeRange, limit);
	}
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

	const params = new URLSearchParams({
		limit: String(limit),
		minWeekTokens: String(minWeekTokens),
	});
	try {
		return await fetchFrontendJson<{ data: TrendingAppData[] }>(
			`/api/frontend/apps/rankings/trending?${params.toString()}`,
		);
	} catch (error) {
		if (!shouldUseDirectFallback(error)) throw error;
		return getTrendingApps(limit, minWeekTokens);
	}
}

export async function fetchFrontendAppsIndexability(): Promise<AppsIndexabilitySnapshot> {
	"use cache";

	cacheLife("hours");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:apps");
	cacheTag("frontend:app-rankings");
	cacheTag("public-top-apps");
	cacheTag("data:public_apps");

	try {
		return await fetchFrontendJson<AppsIndexabilitySnapshot>(
			"/api/frontend/apps/indexability",
		);
	} catch (error) {
		if (!shouldUseDirectFallback(error)) throw error;
		return getAppsIndexabilitySnapshot();
	}
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

	const params = new URLSearchParams();
	appendListParam(params, "apiLookupId", apiLookupIds);
	appendListParam(params, "providerId", providerIds);
	const query = params.toString();

	return fetchFrontendJson<ProviderModelMapping[]>(
		`/api/frontend/apps/${encodePathSegment(
			appId,
		)}/provider-model-mappings${query ? `?${query}` : ""}`,
	);
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

	const params = new URLSearchParams();
	appendListParam(params, "modelId", modelIds);
	const query = params.toString();

	try {
		return await fetchFrontendJson<Record<string, ModelLeaderboardMeta>>(
			`/api/frontend/models/leaderboard-meta${query ? `?${query}` : ""}`,
		);
	} catch (error) {
		if (!shouldUseDirectFallback(error)) throw error;
		return getModelLeaderboardMetaByIds(modelIds);
	}
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

	try {
		return await fetchFrontendJson<{ data: PerformanceData[] }>(
			`/api/frontend/rankings/performance?hours=${hours}`,
		);
	} catch (error) {
		if (!shouldUseDirectFallback(error)) throw error;
		return getPerformanceData(hours);
	}
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

	try {
		return await fetchFrontendJson<RankingsIndexabilitySnapshot>(
			"/api/frontend/rankings/indexability",
		);
	} catch (error) {
		if (!shouldUseDirectFallback(error)) throw error;
		return getRankingsIndexabilitySnapshot();
	}
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

	const params = new URLSearchParams({ dimension, timeRange });
	try {
		return await fetchFrontendJson<{ data: MarketShareData[] }>(
			`/api/frontend/rankings/market-share?${params.toString()}`,
		);
	} catch (error) {
		if (!shouldUseDirectFallback(error)) throw error;
		return getMarketShare(dimension, timeRange);
	}
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

	const params = new URLSearchParams({
		dimension,
		timeRange,
		bucketSize,
		topN: String(topN),
	});
	try {
		return await fetchFrontendJson<{ data: MarketShareTimeseriesData[] }>(
			`/api/frontend/rankings/market-share-timeseries?${params.toString()}`,
		);
	} catch (error) {
		if (!shouldUseDirectFallback(error)) throw error;
		return getMarketShareTimeseries(dimension, timeRange, bucketSize, topN);
	}
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

	const params = new URLSearchParams({
		timeRange,
		bucketSize,
		topN: String(topN),
	});
	try {
		return await fetchFrontendJson<{ data: TimeseriesData[] }>(
			`/api/frontend/rankings/timeseries?${params.toString()}`,
		);
	} catch (error) {
		if (!shouldUseDirectFallback(error)) throw error;
		return getTimeseriesData(timeRange, bucketSize, topN);
	}
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

	const params = new URLSearchParams({
		timeRange,
		metric,
		limit: String(limit),
	});
	try {
		return await fetchFrontendJson<RankingsResponse>(
			`/api/frontend/rankings/model-rankings?${params.toString()}`,
		);
	} catch (error) {
		if (!shouldUseDirectFallback(error)) throw error;
		return getRankings(timeRange, metric, limit);
	}
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

	const params = new URLSearchParams();
	appendListParam(params, "modelId", modelIds);
	const query = params.toString();
	try {
		return await fetchFrontendJson<Record<string, string>>(
			`/api/frontend/rankings/model-names${query ? `?${query}` : ""}`,
		);
	} catch (error) {
		if (!shouldUseDirectFallback(error)) throw error;
		return getModelNamesByIds(modelIds);
	}
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

	const params = new URLSearchParams();
	appendListParam(params, "providerId", providerIds);
	const query = params.toString();
	try {
		return await fetchFrontendJson<Record<string, string>>(
			`/api/frontend/rankings/provider-names${query ? `?${query}` : ""}`,
		);
	} catch (error) {
		if (!shouldUseDirectFallback(error)) throw error;
		return getProviderNamesByIds(providerIds);
	}
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

	const params = new URLSearchParams();
	appendListParam(params, "providerId", providerIds);
	const query = params.toString();
	try {
		return await fetchFrontendJson<Record<string, ProviderMeta>>(
			`/api/frontend/rankings/provider-meta${query ? `?${query}` : ""}`,
		);
	} catch (error) {
		if (!shouldUseDirectFallback(error)) throw error;
		return getProviderMetaByIds(providerIds);
	}
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

	const params = new URLSearchParams();
	appendListParam(params, "name", names);
	const query = params.toString();
	try {
		return await fetchFrontendJson<Record<string, string>>(
			`/api/frontend/rankings/organisation-logo-ids${query ? `?${query}` : ""}`,
		);
	} catch (error) {
		if (!shouldUseDirectFallback(error)) throw error;
		return getOrganisationLogoIdsByNames(names);
	}
}

export async function fetchFrontendCompareModels(): Promise<ExtendedModel[]> {
	"use cache";

	cacheLife("days");
	cacheTag("public-model-catalogue");
	cacheTag("frontend:compare-models");
	cacheTag("data:models");

	try {
		return await fetchFrontendJson<ExtendedModel[]>("/api/frontend/compare/models");
	} catch (error) {
		if (!shouldUseDirectFallback(error)) throw error;
		return loadCompareModelsCached(false);
	}
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

	const params = new URLSearchParams();
	appendListParam(params, "modelId", modelIds);
	const query = params.toString();

	return fetchFrontendJson<ExtendedModel[]>(
		`/api/frontend/compare/models/details${query ? `?${query}` : ""}`,
	);
}
