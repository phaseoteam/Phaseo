import type {
	AppDetails,
	AppUsageRow,
	RangeKey,
} from "@/lib/fetchers/apps/types";
import type { ProfileSnapshot } from "@/lib/fetchers/profile/types";
import type {
	OgEntity,
	OgPayload,
} from "@/lib/fetchers/frontend/getOgPayload";
import type {
	SignInModel,
	SupportedModelsStats,
} from "@/lib/fetchers/landing/sign-in/types";
import type { ExtendedModel } from "@/data/types";
import type { APIProviderCard } from "@/lib/fetchers/api-providers/providerDataTypes";
import type { APIProviderHeader } from "@/lib/fetchers/api-providers/types";
import type { APIProviderModelListItem } from "@/lib/fetchers/api-providers/providerDataTypes";
import type { ProviderAppTokenTimeseries, ProviderTokenTimeseries } from "@/lib/fetchers/api-providers/providerDataTypes";
import type { AppStats, ModelStats, APIProviderUpdates } from "@/lib/fetchers/api-providers/providerDataTypes";
import type { ProviderMetrics } from "@/lib/fetchers/api-providers/providerDataTypes";
import type { BenchmarkCard, BenchmarkPage } from "@/lib/fetchers/benchmarks/types";
import type { CountryListSummary, CountrySummary } from "@/lib/fetchers/countries/types";
import { getComparisonModelsCached } from "@/lib/fetchers/compare/getComparisonModels";
import type { FamilyCard, FamilyInfo } from "@/lib/fetchers/families/types";
import type {
	MarketplacePreset,
	MarketplacePresetDetail,
} from "@/lib/fetchers/gateway/marketplaceTypes";
import type { GatewayMarketingMetrics } from "@/lib/fetchers/gateway/getMarketingMetrics";
import type { ModelAppUsage } from "@/lib/fetchers/models/getModelApps";
import type { ModelBenchmarkHighlight } from "@/lib/fetchers/models/getModelBenchmarkData";
import getModelGatewayMetadata, {
	type ModelGatewayMetadata,
} from "@/lib/fetchers/models/getModelGatewayMetadata";
import type { FreeRouterOverview } from "@/lib/fetchers/models/getFreeRouterOverview";
import getModelOverviewHeader, {
	type ModelOverviewHeader,
} from "@/lib/fetchers/models/getModelOverviewHeader";
import {
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
import getModelPricing, {
	type ProviderPricing,
} from "@/lib/fetchers/models/getModelPricing";
import {
	type ModelPricingHistoryRule,
} from "@/lib/fetchers/models/getModelPricingHistoryRules";
import type {
	ProviderHealthMetricsMap,
	ProviderRuntimeStatsMap,
} from "@/lib/fetchers/models/getModelProviderRuntimeStats";
import {
	getModelProviderHealthMetrics,
	getModelProviderRuntimeStats,
} from "@/lib/fetchers/models/getModelProviderRuntimeStats";
import type { ModelUsageDailyBreakdownRow } from "@/lib/fetchers/models/getModelUsageDailyBreakdown";
import type { ProviderRoutingStatusMap } from "@/lib/fetchers/models/getModelProviderRoutingHealth";
import type { ModelRealtimeWindowStats } from "@/lib/fetchers/models/getModelRealtimeWindowStats";
import {
	type SubscriptionPlan,
} from "@/lib/fetchers/models/getModelSubscriptionPlans";
import {
	type RawEvent,
} from "@/lib/fetchers/models/timelineTypes";
import type { ModelTokenTrajectory } from "@/lib/fetchers/models/getModelTokenTrajectory";
import {
	mapRawToModelCard,
	summarizeMonitorRowsForModel,
	type ModelCard,
} from "@/lib/fetchers/models/getAllModels";
import {
	type ModelOverviewPage,
} from "@/lib/fetchers/models/getModel";
import type { MonitorModelData } from "@/lib/fetchers/models/table-view/getMonitorModels";
import { featureOrder } from "@/lib/config/featureLabels";
import {
	resolveCanonicalModelId,
	type ResolveCanonicalModelIdResult,
} from "@/lib/fetchers/models/resolveCanonicalModelId";
import type { OrganisationCard } from "@/lib/fetchers/organisations/getAllOrganisations";
import type {
	OrganisationData,
	OrganisationModelCards,
	OrganisationOverviewHeader,
} from "@/lib/fetchers/organisations/types";
import type {
	SubscriptionPlanDetails,
	SubscriptionPlanSummary,
} from "@/lib/fetchers/subscription-plans/types";
import {
	fetchOptionalPublicWebApi,
	fetchPublicWebApi,
} from "@/lib/web-api/client";
import type { PricingModel } from "@/lib/fetchers/pricing/getPricingModels";
import type {
	AppsIndexabilitySnapshot,
	MarketShareData,
	MarketShareTimeseriesData,
	ModelLeaderboardMeta,
	ModalityTimeseriesMetric,
	MultimodalData,
	PerformanceData,
	ProviderMeta,
	RankingsIndexabilitySnapshot,
	RankingsResponse,
	TimeseriesData,
	TopAppData,
	TrendingAppData,
	TopModelWithMetadata,
} from "@/lib/fetchers/rankings/getRankingsData";
import type { DbStats } from "@/lib/fetchers/landing/dbStats";
import type {
	ModelEvent,
	ModelEventSegments,
	UpdateCardProps,
} from "@/lib/fetchers/updates/types";
type ModelUpdateCardProps = UpdateCardProps;
import type {
	MonitorHistoryDbPage,
	MonitorHistoryInitialData,
	MonitorHistoryPageFilters,
} from "@/lib/fetchers/monitor/getMonitorHistory";

export type FrontendLandingStats = {
	db: DbStats;
	monthlyTokenTotal: number;
};

export type FrontendGatewayShowcaseData = {
	appImageUrls: Record<string, string | null>;
	metrics: GatewayMarketingMetrics;
	topApps: { data: TopAppData[] };
	topModels: { data: TopModelWithMetadata[] };
};

export type ProviderModelMapping = {
	provider_id: string | null;
	api_model_id: string | null;
	model_id: string | null;
};

export async function fetchFrontendModels(): Promise<ModelCard[]> {
	type ModelsResponse = {
		models: unknown[];
		total: number;
		limit: number;
		offset: number;
	};
	const pageSize = 2_000;
	const firstPage = await fetchPublicWebApi<ModelsResponse>(
		`/api/_web/models?limit=${pageSize}&offset=0`,
	);
	const offsets: number[] = [];
	for (let offset = pageSize; offset < firstPage.total; offset += pageSize) {
		offsets.push(offset);
	}
	const laterPages = await Promise.all(
		offsets.map((offset) => fetchPublicWebApi<ModelsResponse>(
			`/api/_web/models?limit=${pageSize}&offset=${offset}`,
		)),
	);
	return [firstPage, ...laterPages]
		.flatMap((page) => page.models)
		.map((raw) => {
			const model = mapRawToModelCard(raw);
			const monitorRows = model.gateway_monitor_rows ?? [];
			return {
				...model,
				...summarizeMonitorRowsForModel(monitorRows),
			};
		})
		.filter((model) => Boolean(model.model_id));
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
	const models = (await fetchFrontendModels())
		.flatMap((model) => model.gateway_monitor_rows ?? []) as MonitorModelData[];
	const endpoints = new Set<string>();
	const modalities = new Set<string>();
	const features = new Set<string>();
	const statuses = new Set<string>();
	const tiers = new Set<string>(["standard"]);
	for (const model of models) {
		if (model.endpoint) endpoints.add(model.endpoint);
		for (const modality of [...model.inputModalities, ...model.outputModalities]) {
			if (modality) modalities.add(modality);
		}
		for (const feature of model.provider.features) if (feature) features.add(feature);
		if (model.gatewayStatus) statuses.add(model.gatewayStatus);
		if (model.tier) tiers.add(model.tier);
	}
	const featureOrderIndex = new Map(featureOrder.map((feature, index) => [feature, index]));
	return {
		models,
		allTiers: [...tiers].sort(),
		allEndpoints: [...endpoints].sort(),
		allModalities: [...modalities].sort(),
		allFeatures: [...features].sort((left, right) => {
			const leftIndex = featureOrderIndex.get(left);
			const rightIndex = featureOrderIndex.get(right);
			if (leftIndex !== undefined || rightIndex !== undefined) {
				if (leftIndex === undefined) return 1;
				if (rightIndex === undefined) return -1;
				return leftIndex - rightIndex;
			}
			return left.localeCompare(right);
		}),
		allStatuses: [...statuses].sort(),
	};
}

export async function fetchFrontendFreeRouterOverview(): Promise<FreeRouterOverview> {
	return fetchPublicWebApi<FreeRouterOverview>("/api/_web/models/free-router-overview");
}

export async function fetchFrontendLandingStats(): Promise<FrontendLandingStats> {
	return fetchPublicWebApi<FrontendLandingStats>("/api/_web/landing/stats");
}

export async function fetchFrontendGatewayShowcase(args: {
	topModelsLimit?: number;
	topAppsLimit?: number;
} = {}): Promise<FrontendGatewayShowcaseData> {
	const topModelsLimit = Math.max(0, Math.min(25, args.topModelsLimit ?? 6));
	const topAppsLimit = Math.max(0, Math.min(50, args.topAppsLimit ?? 25));
	return fetchPublicWebApi<FrontendGatewayShowcaseData>(
		`/api/_web/landing/gateway-showcase?hours=${24 * 30}&top_models_limit=${encodeURIComponent(String(topModelsLimit))}&top_apps_limit=${encodeURIComponent(String(topAppsLimit))}`,
	);
}

export async function fetchFrontendMonitorHistoryInitialData(): Promise<MonitorHistoryInitialData> {
	return fetchPublicWebApi<MonitorHistoryInitialData>("/api/_web/monitor/history/initial");
}

export async function fetchFrontendMonitorHistoryPage(
	filters: MonitorHistoryPageFilters = {},
): Promise<MonitorHistoryDbPage> {
	const query = new URLSearchParams();
	if (filters.changeType) query.set("change_type", filters.changeType);
	if (filters.commitLimit != null) query.set("commit_limit", String(filters.commitLimit));
	if (filters.commitOffset != null) query.set("commit_offset", String(filters.commitOffset));
	if (filters.model) query.set("model", filters.model);
	if (filters.provider) query.set("provider", filters.provider);
	return fetchPublicWebApi<MonitorHistoryDbPage>(`/api/_web/monitor/history?${query.toString()}`);
}

export async function fetchFrontendModelOverview(
	modelId: string,
): Promise<ModelOverviewPage | null> {
	const payload = await fetchOptionalPublicWebApi<{ model: ModelOverviewPage }>(
		`/api/_web/models/${encodeURIComponent(modelId)}`,
	);
	return payload?.model ?? null;
}

export async function fetchFrontendModelHeader(
	modelId: string,
	includeHidden = false,
): Promise<ModelOverviewHeader | null> {
	if (!includeHidden) {
		const payload = await fetchOptionalPublicWebApi<{ model: ModelOverviewPage }>(
			`/api/_web/models/${encodeURIComponent(modelId)}`,
		);
		const model = payload?.model;
		if (!model) return null;
		return {
			model_id: model.model_id,
			name: model.name,
			organisation_id: model.organisation_id,
			organisation: {
				name: model.organisation?.name ?? model.organisation_id,
				country_code: model.organisation?.country_code ?? "",
			},
			aliases: model.aliases ?? [],
			family_id: model.family_id ?? undefined,
			status: model.status ?? null,
			hidden: false,
		};
	}
	return getModelOverviewHeader(modelId, includeHidden);
}

export async function fetchFrontendModelPageNotice(
	modelId: string,
	includeHidden = false,
): Promise<ModelPageNotice | null> {
	if (includeHidden) {
		throw new Error("Cloudflare public model notices do not expose hidden models");
	}
	const payload = await fetchPublicWebApi<{ notice: ModelPageNotice | null }>(
		`/api/_web/models/${encodeURIComponent(modelId)}/notice`,
	);
	return payload.notice;
}

export async function fetchFrontendCanonicalModelId(
	modelId: string,
	includeHidden = false,
): Promise<ResolveCanonicalModelIdResult> {
	if (!includeHidden) {
		return (await fetchPublicWebApi<{ resolution: ResolveCanonicalModelIdResult }>(
			`/api/_web/models/${encodeURIComponent(modelId)}/canonical`,
		)).resolution;
	}
	return resolveCanonicalModelId(modelId, includeHidden);
}

export async function fetchFrontendModelPendingApiReleaseState(
	modelId: string,
	includeHidden = false,
): Promise<ModelPendingApiReleaseState> {
	if (!includeHidden) {
		const [header, providers] = await Promise.all([
			fetchFrontendModelHeader(modelId, false),
			fetchFrontendModelPricing(modelId).catch(() => null),
		]);
		const now = Date.now();
		const hasActiveProvider = providers?.some((provider) => provider.provider_models.some((model) => {
			if (!model.is_active_gateway || model.capability_status === "disabled" || !model.endpoint || model.endpoint === "unmapped") return false;
			const from = model.effective_from ? Date.parse(model.effective_from) : Number.NEGATIVE_INFINITY;
			const to = model.effective_to ? Date.parse(model.effective_to) : Number.POSITIVE_INFINITY;
			return now >= (Number.isFinite(from) ? from : Number.NEGATIVE_INFINITY)
				&& now < (Number.isFinite(to) ? to : Number.POSITIVE_INFINITY);
		})) ?? false;
		return {
			isPendingApiRelease: header?.status === "Available" && providers !== null && !hasActiveProvider,
			modelName: header?.name ?? "This model",
		};
	}
	return getModelPendingApiReleaseState(modelId, includeHidden);
}

export async function fetchFrontendModelPricing(
	modelId: string,
): Promise<ProviderPricing[]> {
	return getModelPricing(modelId, false);
}

export async function fetchFrontendModelPricingHistory(
	modelId: string,
	options: { includeHidden?: boolean; days?: number } = {},
): Promise<ModelPricingHistoryRule[]> {
	if (options.includeHidden) throw new Error("Cloudflare public pricing history does not expose hidden models");
	return (await fetchPublicWebApi<{ rules: ModelPricingHistoryRule[] }>(
		`/api/_web/models/${encodeURIComponent(modelId)}/pricing-history?days=${encodeURIComponent(String(options.days ?? 30))}`,
	)).rules;
}

export async function fetchFrontendModelSubscriptionPlans(
	modelId: string,
): Promise<SubscriptionPlan[]> {
	const payload = await fetchOptionalPublicWebApi<{
		subscription_plans: SubscriptionPlan[];
	}>(`/api/_web/models/${encodeURIComponent(modelId)}/subscription-plans`);
	return payload?.subscription_plans ?? [];
}

export async function fetchFrontendModelGatewayMetadata(
	modelId: string,
): Promise<ModelGatewayMetadata> {
	return getModelGatewayMetadata(modelId, false);
}

export async function fetchFrontendModelAvailability(
	modelId: string,
): Promise<{ isGatewayActive: boolean; activeProviderCount: number }> {
	return (await fetchPublicWebApi<{
		availability: { isGatewayActive: boolean; activeProviderCount: number };
	}>(`/api/_web/models/${encodeURIComponent(modelId)}/availability`)).availability;
}

export async function fetchFrontendModelTimeline(
	modelId: string,
): Promise<{ events: RawEvent[] } | null> {
	return fetchOptionalPublicWebApi<{ events: RawEvent[] }>(
		`/api/_web/models/${encodeURIComponent(modelId)}/timeline`,
	);
}

export async function fetchFrontendModelApps(
	modelId: string,
): Promise<ModelAppUsage[]> {
	const payload = await fetchPublicWebApi<{ apps: ModelAppUsage[] }>(`/api/_web/models/${encodeURIComponent(modelId)}/apps`);
	return payload.apps;
}

export async function fetchFrontendModelPerformance(
	modelId: string,
	windowHours = 24,
	cloudflareColo?: string | null,
	percentile = 50,
): Promise<ModelPerformanceMetrics | null> {
	void windowHours;
	const params = new URLSearchParams({ percentile: String(percentile) });
	if (cloudflareColo) params.set("colo", cloudflareColo);
	const query = `?${params.toString()}`;
	return (await fetchOptionalPublicWebApi<{ metrics: ModelPerformanceMetrics | null }>(`/api/_web/models/${encodeURIComponent(modelId)}/performance${query}`))?.metrics ?? null;
}

export type ModelPerformanceColo = { colo: string; requests: number };

export async function fetchFrontendModelPerformanceColos(
	modelId: string,
): Promise<ModelPerformanceColo[]> {
	return (await fetchOptionalPublicWebApi<{ colos: ModelPerformanceColo[] }>(
		`/api/_web/models/${encodeURIComponent(modelId)}/performance/colos`,
	))?.colos ?? [];
}

export async function fetchFrontendModelActivitySnapshot(
	modelId: string,
): Promise<ModelPerformanceActivitySnapshot | null> {
	return (await fetchOptionalPublicWebApi<{ activity: ModelPerformanceActivitySnapshot | null }>(`/api/_web/models/${encodeURIComponent(modelId)}/performance`))?.activity ?? null;
}

export async function fetchFrontendModelTokenTrajectory(
	modelId: string,
): Promise<ModelTokenTrajectory | null> {
	const payload = await fetchOptionalPublicWebApi<{ trajectory: ModelTokenTrajectory | null }>(
		`/api/_web/models/${encodeURIComponent(modelId)}/token-trajectory`,
	);
	return payload?.trajectory ?? null;
}

export async function fetchFrontendModelRealtimeWindowStats(
	modelId: string,
	windowMinutes = 30,
): Promise<ModelRealtimeWindowStats | null> {
	return (await fetchPublicWebApi<{ stats: ModelRealtimeWindowStats }>(
		`/api/_web/models/${encodeURIComponent(modelId)}/realtime?minutes=${encodeURIComponent(String(windowMinutes))}`,
	)).stats;
}

export async function fetchFrontendModelProviderRuntimeStats(args: {
	modelId: string;
	providerIds: string[];
	modelAliases: string[];
	percentile?: number;
}): Promise<ProviderRuntimeStatsMap> {
	return getModelProviderRuntimeStats(args);
}

export async function fetchFrontendModelProviderHealthMetrics(args: {
	modelId: string;
	providerIds: string[];
	modelAliases: string[];
	windowDays?: number;
	bucketHours?: number;
}): Promise<ProviderHealthMetricsMap> {
	return getModelProviderHealthMetrics(args);
}

export async function fetchFrontendModelUsageDailyBreakdown(args: {
	modelId: string;
	modelAliases?: string[];
	providerIds?: string[];
	days?: number;
	since?: string;
	until?: string;
}): Promise<ModelUsageDailyBreakdownRow[]> {
	const query = new URLSearchParams();
	if (args.providerIds?.length) query.set("provider_ids", [...new Set(args.providerIds)].sort().join(","));
	if (args.days != null) query.set("days", String(args.days));
	if (args.since) query.set("since", args.since);
	if (args.until) query.set("until", args.until);
	void args.modelAliases;
	return (await fetchPublicWebApi<{ rows: ModelUsageDailyBreakdownRow[] }>(`/api/_web/models/${encodeURIComponent(args.modelId)}/usage-daily?${query.toString()}`)).rows;
}

export async function fetchFrontendModelProviderRoutingHealth(args: {
	modelId: string;
	providerIds: string[];
	windowHours?: number;
}): Promise<ProviderRoutingStatusMap> {
	if (args.providerIds.length === 0) return {};
	const providerIds = [...new Set(args.providerIds)].sort((a, b) => a.localeCompare(b));
	const query = new URLSearchParams({ provider_ids: providerIds.join(",") });
	if (args.windowHours != null) query.set("window_hours", String(args.windowHours));
	return (await fetchPublicWebApi<{ providers: ProviderRoutingStatusMap }>(
		`/api/_web/models/provider-routing-health?${query.toString()}`,
	)).providers;
}

export async function fetchFrontendModelBenchmarkHighlights(
	modelId: string,
): Promise<ModelBenchmarkHighlight[]> {
	const payload = await fetchOptionalPublicWebApi<{ highlights: ModelBenchmarkHighlight[] }>(`/api/_web/models/${encodeURIComponent(modelId)}/benchmarks`);
	return payload?.highlights ?? [];
}

export async function fetchFrontendAPIProviders(): Promise<APIProviderCard[]> {
	const payload = await fetchPublicWebApi<{ providers: APIProviderCard[] }>("/api/_web/api-providers");
	return payload.providers;
}

export async function fetchFrontendAPIProviderHeader(
	apiProviderId: string,
): Promise<APIProviderHeader | null> {
	const payload = await fetchOptionalPublicWebApi<{ provider: APIProviderHeader }>(
		`/api/_web/api-providers/${encodeURIComponent(apiProviderId)}/header`,
	);
	return payload?.provider ?? null;
}

export async function fetchFrontendAPIProviderModels(
	apiProviderId: string,
): Promise<APIProviderModelListItem[]> {
	const payload = await fetchPublicWebApi<{ models: APIProviderModelListItem[] }>(`/api/_web/api-providers/${encodeURIComponent(apiProviderId)}/models`);
	return payload.models;
}

export async function fetchFrontendAPIProviderTopApps(
	apiProviderId: string,
	period: "day" | "week" | "month" = "day",
	count = 20,
): Promise<AppStats[]> {
	const payload = await fetchPublicWebApi<{ apps: AppStats[] }>(`/api/_web/api-providers/${encodeURIComponent(apiProviderId)}/top-apps?period=${period}&count=${encodeURIComponent(String(count))}`);
	return payload.apps;
}

export async function fetchFrontendAPIProviderTopModels(
	apiProviderId: string,
	count = 6,
): Promise<ModelStats[]> {
	const payload = await fetchPublicWebApi<{ models: ModelStats[] }>(`/api/_web/api-providers/${encodeURIComponent(apiProviderId)}/top-models?count=${encodeURIComponent(String(count))}`);
	return payload.models;
}

export async function fetchFrontendAPIProviderModelTokenTimeseries(
	apiProviderId: string,
	options: { days?: number; topModels?: number } = {},
): Promise<ProviderTokenTimeseries> {
	return fetchPublicWebApi<ProviderTokenTimeseries>(`/api/_web/api-providers/${encodeURIComponent(apiProviderId)}/model-token-timeseries?days=${encodeURIComponent(String(options.days ?? 30))}&topModels=${encodeURIComponent(String(options.topModels ?? 8))}`);
}

export async function fetchFrontendAPIProviderAppTokenTimeseries(
	apiProviderId: string,
	options: { days?: number; topApps?: number } = {},
): Promise<ProviderAppTokenTimeseries> {
	return fetchPublicWebApi<ProviderAppTokenTimeseries>(`/api/_web/api-providers/${encodeURIComponent(apiProviderId)}/app-token-timeseries?days=${encodeURIComponent(String(options.days ?? 30))}&topApps=${encodeURIComponent(String(options.topApps ?? 20))}`);
}

export async function fetchFrontendAPIProviderMetrics(
	apiProviderId: string,
	hours = 24 * 7,
): Promise<ProviderMetrics> {
	return fetchPublicWebApi<ProviderMetrics>(`/api/_web/api-providers/${encodeURIComponent(apiProviderId)}/metrics?hours=${encodeURIComponent(String(hours))}`);
}

export async function fetchFrontendAPIProviderUpdates(
	apiProviderId: string,
): Promise<APIProviderUpdates> {
	return fetchPublicWebApi<APIProviderUpdates>(`/api/_web/api-providers/${encodeURIComponent(apiProviderId)}/updates`);
}

export async function fetchFrontendOrganisations(): Promise<OrganisationCard[]> {
	const payload = await fetchPublicWebApi<{ organisations: OrganisationCard[] }>(
		"/api/_web/organisations",
	);
	return payload.organisations;
}

export async function fetchFrontendOrganisation(
	organisationId: string,
	limit = 12,
): Promise<OrganisationData | null> {
	const payload = await fetchOptionalPublicWebApi<{
		organisation: OrganisationData;
	}>(
		`/api/_web/organisations/${encodeURIComponent(organisationId)}?limit=${encodeURIComponent(String(limit))}`,
	);
	return payload?.organisation ?? null;
}

export async function fetchFrontendOrganisationHeader(
	organisationId: string,
): Promise<OrganisationOverviewHeader | null> {
	const payload = await fetchOptionalPublicWebApi<{
		organisation: OrganisationOverviewHeader;
	}>(`/api/_web/organisations/${encodeURIComponent(organisationId)}/header`);
	return payload?.organisation ?? null;
}

export async function fetchFrontendOrganisationModels(
	organisationId: string,
): Promise<OrganisationModelCards[]> {
	const payload = await fetchOptionalPublicWebApi<{
		models: OrganisationModelCards[];
	}>(`/api/_web/organisations/${encodeURIComponent(organisationId)}/models`);
	return payload?.models ?? [];
}

export async function fetchFrontendBenchmarks(
	sorted = false,
): Promise<BenchmarkCard[]> {
	const path = sorted
		? "/api/_web/benchmarks?sort=coverage"
		: "/api/_web/benchmarks";
	const payload = await fetchPublicWebApi<{ benchmarks: BenchmarkCard[] }>(path);
	return payload.benchmarks;
}

export async function fetchFrontendBenchmark(
	benchmarkId: string,
): Promise<BenchmarkPage | null> {
	const payload = await fetchOptionalPublicWebApi<{ benchmark: BenchmarkPage }>(
		`/api/_web/benchmarks/${encodeURIComponent(benchmarkId)}`,
	);
	return payload?.benchmark ?? null;
}

export async function fetchFrontendFamilies(): Promise<FamilyCard[]> {
	const payload = await fetchPublicWebApi<{ families: FamilyCard[] }>(
		"/api/_web/families",
	);
	return payload.families;
}

export async function fetchFrontendFamily(
	familyId: string,
): Promise<FamilyInfo | null> {
	return fetchOptionalPublicWebApi<FamilyInfo>(
		`/api/_web/families/${encodeURIComponent(familyId)}`,
	);
}

export async function fetchFrontendSubscriptionPlans(): Promise<
	SubscriptionPlanSummary[]
> {
	const payload = await fetchPublicWebApi<{
		subscription_plans: SubscriptionPlanSummary[];
	}>("/api/_web/subscription-plans");
	return payload.subscription_plans;
}

export async function fetchFrontendSubscriptionPlan(
	planId: string,
): Promise<SubscriptionPlanDetails | null> {
	const payload = await fetchOptionalPublicWebApi<{
		subscription_plan: SubscriptionPlanDetails;
	}>(`/api/_web/subscription-plans/${encodeURIComponent(planId)}`);
	return payload?.subscription_plan ?? null;
}

export async function fetchFrontendCountrySummaries(): Promise<CountryListSummary[]> {
	const payload = await fetchPublicWebApi<{ countries: CountryListSummary[] }>(
		"/api/_web/countries",
	);
	return payload.countries;
}

export async function fetchFrontendCountry(
	iso: string,
): Promise<CountrySummary | null> {
	const payload = await fetchOptionalPublicWebApi<{ country: CountrySummary }>(
		`/api/_web/countries/${encodeURIComponent(iso.toUpperCase())}`,
	);
	return payload?.country ?? null;
}

export async function fetchFrontendPricingModels(): Promise<PricingModel[]> {
	return (await fetchPublicWebApi<{ models: PricingModel[] }>("/api/_web/pricing/models")).models;
}

export async function fetchFrontendMarketplacePresets(): Promise<
	MarketplacePreset[]
> {
	const payload = await fetchPublicWebApi<{ presets: MarketplacePreset[] }>(
		"/api/_web/marketplace/presets",
	);
	return payload.presets;
}

export async function fetchFrontendMarketplacePresetDetail(
	presetId: string,
): Promise<MarketplacePresetDetail | null> {
	return fetchOptionalPublicWebApi<MarketplacePresetDetail>(
		`/api/_web/marketplace/presets/${encodeURIComponent(presetId)}`,
	);
}

export async function fetchFrontendWebUpdates(
	limit = 100,
): Promise<UpdateCardProps[]> {
	const payload = await fetchPublicWebApi<{ updates: UpdateCardProps[] }>(
		`/api/_web/updates/web?limit=${encodeURIComponent(String(limit))}`,
	);
	return payload.updates;
}

export async function fetchFrontendYouTubeUpdates(
	limit = 100,
): Promise<UpdateCardProps[]> {
	const payload = await fetchPublicWebApi<{ updates: UpdateCardProps[] }>(
		`/api/_web/updates/youtube?limit=${encodeURIComponent(String(limit))}`,
	);
	return payload.updates;
}

export async function fetchFrontendUpdateCards(
	limit = 5,
): Promise<UpdateCardProps[]> {
	const payload = await fetchPublicWebApi<{ updates: UpdateCardProps[] }>(
		`/api/_web/updates/latest?limit=${encodeURIComponent(String(limit))}`,
	);
	return payload.updates;
}

export async function fetchFrontendModelUpdateCards(
	limit = 5,
	includeHidden = false,
): Promise<ModelUpdateCardProps[]> {
	if (includeHidden) {
		throw new Error("Cloudflare public model updates do not expose hidden models");
	}
	const payload = await fetchPublicWebApi<{ updates: ModelUpdateCardProps[] }>(
		`/api/_web/updates/models/cards?limit=${encodeURIComponent(String(limit))}`,
	);
	return payload.updates;
}

export async function fetchFrontendSignInSupportedModelsStats(
	includeHidden = false,
): Promise<SupportedModelsStats> {
	if (includeHidden) {
		throw new Error("Cloudflare public landing stats do not expose hidden models");
	}
	return fetchPublicWebApi<SupportedModelsStats>("/api/_web/landing/models/stats");
}

export async function fetchFrontendSignInMainModels(
	modelIds: string[],
	includeHidden = false,
): Promise<SignInModel[]> {
	if (includeHidden) {
		throw new Error("Cloudflare public landing models do not expose hidden models");
	}
	const payload = await fetchPublicWebApi<{ models: SignInModel[] }>(
		`/api/_web/landing/models/main?ids=${encodeURIComponent(modelIds.join(","))}`,
	);
	return payload.models;
}

export async function fetchFrontendModelUpdates(args: {
	limit?: number;
	upcomingLimit?: number;
	includeAllPast?: boolean;
} = {}): Promise<ModelEventSegments> {
	const params = new URLSearchParams();
	if (args.limit !== undefined) params.set("limit", String(args.limit));
	if (args.upcomingLimit !== undefined) {
		params.set("upcoming_limit", String(args.upcomingLimit));
	}
	if (args.includeAllPast !== undefined) {
		params.set("include_all_past", String(args.includeAllPast));
	}
	const query = params.toString();
	return fetchPublicWebApi<ModelEventSegments>(
		`/api/_web/updates/models${query ? `?${query}` : ""}`,
	);
}

export async function fetchFrontendOrganisationReleaseEvents(
	organisationId: string,
): Promise<ModelEvent[]> {
	const payload = await fetchPublicWebApi<{ events: ModelEvent[] }>(
		`/api/_web/updates/organisations/${encodeURIComponent(organisationId)}/releases`,
	);
	return payload.events;
}

export async function fetchFrontendPublicAppIds(): Promise<string[]> {
	const payload = await fetchPublicWebApi<{ ids: string[] }>("/api/_web/apps/ids");
	return payload.ids;
}

export async function fetchFrontendAppDetails(
	appId: string,
): Promise<AppDetails | null> {
	const payload = await fetchOptionalPublicWebApi<{ app: AppDetails }>(
		`/api/_web/apps/${encodeURIComponent(appId)}`,
	);
	return payload?.app ?? null;
}

export async function fetchFrontendPublicProfile(
	slug: string,
): Promise<ProfileSnapshot | null> {
	void slug;
	return null;
}

export async function fetchFrontendOgPayload(
	kind: OgEntity,
	segments: string[],
): Promise<OgPayload | null> {
	const id = kind === "models" ? segments.join("/") : segments[0];
	if (!id) return null;
	const response = await fetchOptionalPublicWebApi<{ payload: OgPayload }>(
		`/api/_web/og?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`,
	);
	return response?.payload ?? null;
}

export async function fetchFrontendAppUsage(
	appId: string,
	range: RangeKey = "4w",
): Promise<AppUsageRow[]> {
	const payload = await fetchOptionalPublicWebApi<{ usage: AppUsageRow[] }>(
		`/api/_web/apps/${encodeURIComponent(appId)}/usage?range=${encodeURIComponent(range)}`,
	);
	return payload?.usage ?? [];
}

export async function fetchFrontendRecentAppRequests(
	appId: string,
	limit = 10,
): Promise<AppUsageRow[]> {
	const payload = await fetchOptionalPublicWebApi<{ requests: AppUsageRow[] }>(
		`/api/_web/apps/${encodeURIComponent(appId)}/requests/recent?limit=${encodeURIComponent(String(limit))}`,
	);
	return payload?.requests ?? [];
}

export async function fetchFrontendAppImageUrls(
	appIds: string[],
): Promise<Record<string, string | null>> {
	if (appIds.length === 0) return {};
	const ids = [...new Set(appIds)].sort((a, b) => a.localeCompare(b));
	return (await fetchPublicWebApi<{ images: Record<string, string | null> }>(
		`/api/_web/apps/images?ids=${encodeURIComponent(ids.join(","))}`,
	)).images;
}

export async function fetchFrontendTopApps(
	timeRange = "week",
	limit = 20,
): Promise<{ data: TopAppData[] }> {
	return fetchPublicWebApi<{ data: TopAppData[] }>(
		`/api/_web/apps/top?time_range=${encodeURIComponent(timeRange)}&limit=${encodeURIComponent(String(limit))}`,
	);
}

export async function fetchFrontendTrendingApps(
	limit = 20,
	minWeekTokens = 0,
): Promise<{ data: TrendingAppData[] }> {
	return fetchPublicWebApi<{ data: TrendingAppData[] }>(
		`/api/_web/apps/trending?limit=${encodeURIComponent(String(limit))}&min_week_tokens=${encodeURIComponent(String(minWeekTokens))}`,
	);
}

export async function fetchFrontendAppsIndexability(): Promise<AppsIndexabilitySnapshot> {
	return fetchPublicWebApi<AppsIndexabilitySnapshot>("/api/_web/apps/indexability");
}

export async function fetchFrontendAppProviderModelMappings(
	appId: string,
	apiLookupIds: string[],
	providerIds: string[],
): Promise<ProviderModelMapping[]> {
	if (apiLookupIds.length === 0) return [];
	const query = new URLSearchParams({ model_ids: [...new Set(apiLookupIds)].sort().join(",") });
	if (providerIds.length) query.set("provider_ids", [...new Set(providerIds)].sort().join(","));
	return (await fetchPublicWebApi<{ mappings: ProviderModelMapping[] }>(
		`/api/_web/apps/provider-model-mappings?${query.toString()}`,
	)).mappings;
}

export async function fetchFrontendModelLeaderboardMetaByIds(
	modelIds: string[],
): Promise<Record<string, ModelLeaderboardMeta>> {
	if (!modelIds.length) return {};
	return (await fetchPublicWebApi<{ models: Record<string, ModelLeaderboardMeta> }>(
		`/api/_web/rankings/model-meta?ids=${encodeURIComponent([...new Set(modelIds)].sort().join(","))}`,
	)).models;
}

export async function fetchFrontendRankingPerformance(
	hours = 24,
): Promise<{ data: PerformanceData[] }> {
	return fetchPublicWebApi<{ data: PerformanceData[] }>(`/api/_web/rankings/performance?hours=${encodeURIComponent(String(hours))}`);
}

export async function fetchFrontendRankingsIndexability(): Promise<RankingsIndexabilitySnapshot> {
	return fetchPublicWebApi<RankingsIndexabilitySnapshot>("/api/_web/rankings/indexability");
}

export async function fetchFrontendMarketShare(
	dimension: "organization" | "provider" = "organization",
	timeRange = "week",
): Promise<{ data: MarketShareData[] }> {
	return fetchPublicWebApi<{ data: MarketShareData[] }>(`/api/_web/rankings/market-share?dimension=${dimension}&time_range=${encodeURIComponent(timeRange)}`);
}

export async function fetchFrontendMarketShareTimeseries(
	dimension: "organization" | "provider" = "organization",
	timeRange = "week",
	bucketSize = "day",
	topN = 8,
): Promise<{ data: MarketShareTimeseriesData[] }> {
	return fetchPublicWebApi<{ data: MarketShareTimeseriesData[] }>(`/api/_web/rankings/market-share-timeseries?dimension=${dimension}&time_range=${encodeURIComponent(timeRange)}&bucket_size=${encodeURIComponent(bucketSize)}&top_n=${encodeURIComponent(String(topN))}`);
}

export async function fetchFrontendRankingTimeseries(
	timeRange = "week",
	bucketSize = "hour",
	topN = 10,
): Promise<{ data: TimeseriesData[] }> {
	return fetchPublicWebApi<{ data: TimeseriesData[] }>(`/api/_web/rankings/timeseries?time_range=${encodeURIComponent(timeRange)}&bucket_size=${encodeURIComponent(bucketSize)}&top_n=${encodeURIComponent(String(topN))}`);
}

export async function fetchFrontendRankingMultimodal(
	timeRange = "week",
): Promise<{ data: MultimodalData[] }> {
	return fetchPublicWebApi<{ data: MultimodalData[] }>(`/api/_web/rankings/multimodal?time_range=${encodeURIComponent(timeRange)}`);
}

export async function fetchFrontendRankingModalityTimeseries(
	metric: ModalityTimeseriesMetric,
	timeRange = "year",
): Promise<{ data: TimeseriesData[] }> {
	return fetchPublicWebApi<{ data: TimeseriesData[] }>(`/api/_web/rankings/modality-timeseries?metric=${encodeURIComponent(metric)}&time_range=${encodeURIComponent(timeRange)}`);
}

export async function fetchFrontendRankingUniqueUserTimeseries(
	timeRange = "year",
	bucketSize = "week",
	topN = 10,
): Promise<{ data: TimeseriesData[] }> {
	return fetchPublicWebApi<{ data: TimeseriesData[] }>(`/api/_web/rankings/unique-users?time_range=${encodeURIComponent(timeRange)}&bucket_size=${encodeURIComponent(bucketSize)}&top_n=${encodeURIComponent(String(topN))}`);
}

export async function fetchFrontendModelRankings(
	timeRange = "week",
	metric = "tokens",
	limit = 50,
): Promise<RankingsResponse> {
	return fetchPublicWebApi<RankingsResponse>(`/api/_web/rankings/models?time_range=${encodeURIComponent(timeRange)}&metric=${encodeURIComponent(metric)}&limit=${encodeURIComponent(String(limit))}`);
}

export async function fetchFrontendModelNamesByIds(
	modelIds: string[],
): Promise<Record<string, string>> {
	const metadata = await fetchFrontendModelLeaderboardMetaByIds(modelIds);
	return Object.fromEntries(Object.entries(metadata).filter(([, value]) => Boolean(value.name)).map(([id, value]) => [id, value.name!])) as Record<string, string>;
}

export async function fetchFrontendProviderNamesByIds(
	providerIds: string[],
): Promise<Record<string, string>> {
	const meta = await fetchFrontendProviderMetaByIds(providerIds);
	return Object.fromEntries(Object.entries(meta).map(([id, value]) => [id, value.name]));
}

export async function fetchFrontendProviderMetaByIds(
	providerIds: string[],
): Promise<Record<string, ProviderMeta>> {
	if (!providerIds.length) return {};
	return (await fetchPublicWebApi<{ providers: Record<string, ProviderMeta> }>(`/api/_web/rankings/provider-meta?ids=${encodeURIComponent([...new Set(providerIds)].sort().join(","))}`)).providers;
}

export async function fetchFrontendOrganisationLogoIdsByNames(
	names: string[],
): Promise<Record<string, string>> {
	if (!names.length) return {};
	return (await fetchPublicWebApi<{ organisations: Record<string, string> }>(`/api/_web/rankings/organisation-logo-ids?names=${encodeURIComponent([...new Set(names)].sort().join(","))}`)).organisations;
}

export async function fetchFrontendCompareModels(): Promise<ExtendedModel[]> {
	return (await fetchPublicWebApi<{ models: ExtendedModel[] }>("/api/_web/compare/models")).models;
}

export async function fetchFrontendComparisonModels(
	modelIds: string[],
): Promise<ExtendedModel[]> {
	return getComparisonModelsCached(modelIds, false);
}

export type FrontendCompareUsage = Record<string, {
	periodDays: number;
	tokens30d: number;
	latestDate: string | null;
	points30d: Array<{ date: string; value: number }>;
	totalRequests: number;
	requests30m: number;
	latencyP50Ms30m: number | null;
	throughputP50TokPerSec30m: number | null;
	cumulativeTokens: number | null;
	requestPoints24h: Array<{ date: string; value: number }>;
}>;

export async function fetchFrontendCompareUsage(modelIds: string[]): Promise<FrontendCompareUsage> {
	if (modelIds.length === 0) return {};
	const ids = [...new Set(modelIds.map((value) => value.trim()).filter(Boolean))].sort();
	return (await fetchPublicWebApi<{ usage: FrontendCompareUsage }>(
		`/api/_web/compare/usage?ids=${encodeURIComponent(ids.join(","))}`,
	)).usage;
}
