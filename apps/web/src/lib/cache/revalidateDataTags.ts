import { revalidatePath, updateTag } from "next/cache";

type RevalidateModelDataTagOptions = {
	modelId?: string | null;
	organisationIds?: Array<string | null | undefined>;
	benchmarkIds?: Array<string | null | undefined>;
};

type RevalidateBenchmarkTagOptions = {
	benchmarkId?: string | null;
	benchmarkIds?: Array<string | null | undefined>;
	modelId?: string | null;
};

type RevalidateProviderTagOptions = {
	providerId?: string | null;
	providerIds?: Array<string | null | undefined>;
};

type RevalidateOrganisationTagOptions = {
	organisationId?: string | null;
	organisationIds?: Array<string | null | undefined>;
};

const MODEL_DATA_GLOBAL_TAGS = [
	"audit-models",
	"search:data",
	"data:model-updates",
	"frontend:model-updates",
	"frontend:model-update-cards",
	"frontend:update-cards",
	"data:models",
	"data:organisations",
	"data:organisations:list",
	"frontend:organisations",
	"frontend:organisation-models",
	"frontend:organisation-header",
	"data:families",
	"frontend:families",
	"data:benchmarks",
	"data:benchmarks:list",
	"frontend:benchmarks",
	"data:sign-in:models",
	"data:sign-in:supported-models-stats",
	"frontend:sign-in-main-models",
	"frontend:sign-in-supported-models-stats",
	"landing:db-stats",
	"frontend:landing-stats",
	"frontend:gateway-showcase",
	"gateway:marketing-metrics",
	"page:models",
	"models:list-base",
	"frontend:models",
	"frontend:model-collections",
	"frontend:model-overview",
	"frontend:model-header",
	"frontend:model-notice",
	"frontend:model-canonical",
	"frontend:model-pending-api-release",
	"frontend:model-timeline",
	"frontend:compare-models",
	"frontend:compare-model-details",
	"frontend:comparison-models",
] as const;

const MODEL_API_GLOBAL_TAGS = [
	"data:api_providers",
	"data:api_providers:list",
	"data:model_aliases",
	"data:data_api_provider_models",
	"data:data_api_models",
	"data:data_api_pricing_rules",
	"web-api-models",
	"web-api-models-v2",
	"data:gateway_requests",
	"data:gateway_usage_rollups",
	"data:gateway_provider_health_states",
	"data:top_apps",
	"data:top_models",
	"monitor-models",
	"models:monitor",
	"page:models",
	"gateway-supported-models",
	"frontend:monitor-models",
	"frontend:free-router-overview",
	"monitor-history",
	"frontend:monitor-history",
	"frontend:api-providers",
	"frontend:api-provider-models",
	"frontend:api-provider-top-apps",
	"frontend:api-provider-top-models",
	"frontend:api-provider-token-timeseries",
	"frontend:api-provider-metrics",
	"frontend:api-provider-updates",
	"frontend:gateway-models",
	"frontend:model-pricing",
	"frontend:model-pricing-history",
	"frontend:model-subscription-plans",
	"frontend:model-gateway-metadata",
	"frontend:model-availability",
	"frontend:model-apps",
	"frontend:model-performance",
	"frontend:model-activity",
	"frontend:model-token-trajectory",
	"frontend:model-realtime-window",
	"frontend:model-runtime-stats",
	"frontend:model-usage-daily",
	"frontend:model-routing-health",
	"frontend:model-benchmarks",
	"frontend:model-leaderboard-meta",
	"frontend:pricing-models",
] as const;

const MODEL_CANONICAL_RESOLVER_TAGS = [
	"data:models",
	"data:model_aliases",
	"data:data_api_provider_models",
	"data:data_api_models",
] as const;

const PUBLIC_MODEL_CATALOGUE_GLOBAL_TAGS = [
	...MODEL_DATA_GLOBAL_TAGS,
	...MODEL_API_GLOBAL_TAGS,
	...MODEL_CANONICAL_RESOLVER_TAGS,
	"public-model-catalogue",
	"data:data_api_provider_model_capabilities",
	"data:subscription_plans",
	"frontend:subscription-plans",
	"data:country_summaries",
	"frontend:countries",
	"frontend:sources",
	"frontend:marketplace-presets",
	"frontend:web-updates",
	"frontend:youtube-updates",
	"data:public_apps",
	"data:app_details",
	"data:app_usage",
	"data:apps",
	"public-top-apps",
	"frontend:rankings",
	"frontend:rankings-indexability",
	"frontend:rankings-performance",
	"frontend:rankings-market-share",
	"frontend:rankings-market-share-timeseries",
	"frontend:rankings-timeseries",
	"frontend:model-rankings",
	"frontend:model-names",
	"frontend:provider-names",
	"frontend:provider-meta",
	"frontend:organisation-logo-ids",
	"frontend:apps",
	"frontend:app-details",
	"frontend:app-usage",
	"frontend:app-images",
	"frontend:app-rankings",
	"frontend:app-provider-model-mappings",
	"frontend:profile",
	"data:profiles",
	"og:payload",
	"frontend:og-payload",
] as const;

function expireTagList(tags: readonly string[]) {
	for (const tag of new Set(tags)) {
		updateTag(tag);
	}
}

function revalidatePublicCataloguePaths(options: RevalidateModelDataTagOptions) {
	revalidatePath("/");
	revalidatePath("/chat");
	revalidatePath("/chat/image");
	revalidatePath("/chat/video");
	revalidatePath("/chat/audio");
	revalidatePath("/chat/moderation");
	revalidatePath("/chat/embeddings");
	revalidatePath("/models");
	revalidatePath("/models", "layout");
	revalidatePath("/models/table");
	revalidatePath("/monitor");
	revalidatePath("/compare");
	revalidatePath("/pricing");
	revalidatePath("/api-providers", "layout");
	revalidatePath("/organisations", "layout");
	revalidatePath("/updates");
	revalidatePath("/updates/models");
	revalidatePath("/apps");
	revalidatePath("/sitemap.xml");

	if (options.modelId) {
		revalidatePath(`/models/${options.modelId}`, "layout");
	}

	for (const organisationId of options.organisationIds ?? []) {
		if (!organisationId) continue;
		revalidatePath(`/organisations/${organisationId}`);
		revalidatePath(`/organisations/${organisationId}/models`);
	}
}

export function expirePublicModelCatalogueCache(
	options: RevalidateModelDataTagOptions = {}
) {
	expireTagList(PUBLIC_MODEL_CATALOGUE_GLOBAL_TAGS);

	if (options.modelId) {
		expireTagList([
			`model:canonical:${options.modelId}`,
			`model:api:${options.modelId}`,
			`model:data:${options.modelId}`,
			`model:header:${options.modelId}`,
			`model:pricing-history:${options.modelId}`,
			`model:performance:${options.modelId}`,
			`data:models:${options.modelId}`,
			`data:model_apps:${options.modelId}`,
			`data:gateway_requests:model:${options.modelId}`,
			`data:gateway_usage_rollups:model:${options.modelId}`,
			`data:benchmarks:model:${options.modelId}`,
			`model:benchmarks:highlights:${options.modelId}`,
			`model:benchmarks:table:${options.modelId}`,
			`model:benchmarks:comparisons:${options.modelId}`,
		]);
	}

	for (const organisationId of options.organisationIds ?? []) {
		if (!organisationId) continue;
		expireTagList([
			`organisation:header:${organisationId}`,
			`data:organisations:${organisationId}`,
		]);
	}

	revalidatePublicCataloguePaths(options);
}

export function revalidateModelDataOnlyTags(
	options: RevalidateModelDataTagOptions = {}
) {
	const tags: string[] = [...MODEL_DATA_GLOBAL_TAGS];

	for (const organisationId of options.organisationIds ?? []) {
		if (!organisationId) continue;
		tags.push(
			`organisation:header:${organisationId}`,
			`data:organisations:${organisationId}`,
		);
	}

	if (options.modelId) {
		tags.push(
			`model:data:${options.modelId}`,
			`model:header:${options.modelId}`,
			`data:models:${options.modelId}`,
			`data:benchmarks:model:${options.modelId}`,
			`model:benchmarks:highlights:${options.modelId}`,
			`model:benchmarks:table:${options.modelId}`,
			`model:benchmarks:comparisons:${options.modelId}`,
		);
	}

	for (const benchmarkId of options.benchmarkIds ?? []) {
		if (!benchmarkId) continue;
		tags.push(`data:benchmarks:${benchmarkId}`);
		if (options.modelId) {
			tags.push(
				`data:benchmarks:model:${options.modelId}:benchmark:${benchmarkId}`,
			);
		}
	}

	expireTagList(tags);
}

export function revalidateModelApiInfoTags(
	options: RevalidateModelDataTagOptions = {}
) {
	const hasModelScope = Boolean(options.modelId);
	const tags: string[] = [];
	if (!hasModelScope) {
		tags.push(...MODEL_API_GLOBAL_TAGS, ...MODEL_CANONICAL_RESOLVER_TAGS);
	}

	if (options.modelId) {
		tags.push(
			`model:canonical:${options.modelId}`,
			`model:api:${options.modelId}`,
			`model:pricing-history:${options.modelId}`,
			`model:performance:${options.modelId}`,
			`data:model_apps:${options.modelId}`,
			`data:gateway_requests:model:${options.modelId}`,
			`data:gateway_usage_rollups:model:${options.modelId}`,
		);
	}

	expireTagList(tags);
}

/**
 * Backward-compatible "full model refresh" helper.
 * Revalidates both model data and model API info surfaces.
 */
export function revalidateModelDataTags(
	options: RevalidateModelDataTagOptions = {}
) {
	revalidateModelDataOnlyTags(options);
	revalidateModelApiInfoTags(options);
}

export function revalidateBenchmarkDataTags(
	options: RevalidateBenchmarkTagOptions = {}
) {
	const tags = ["data:benchmarks", "data:benchmarks:list"];
	if (options.modelId) {
		tags.push(
			`data:benchmarks:model:${options.modelId}`,
			`model:benchmarks:highlights:${options.modelId}`,
			`model:benchmarks:table:${options.modelId}`,
			`model:benchmarks:comparisons:${options.modelId}`,
		);
	}

	const benchmarkIds = new Set<string>();
	if (options.benchmarkId) benchmarkIds.add(options.benchmarkId);
	for (const benchmarkId of options.benchmarkIds ?? []) {
		if (!benchmarkId) continue;
		benchmarkIds.add(benchmarkId);
	}

	for (const benchmarkId of benchmarkIds) {
		tags.push(`data:benchmarks:${benchmarkId}`);
		if (options.modelId) {
			tags.push(
				`data:benchmarks:model:${options.modelId}:benchmark:${benchmarkId}`,
			);
		}
	}

	expireTagList(tags);
}

export function revalidateProviderDataTags(
	options: RevalidateProviderTagOptions = {}
) {
	const tags: string[] = [...MODEL_API_GLOBAL_TAGS];

	const providerIds = new Set<string>();
	if (options.providerId) providerIds.add(options.providerId);
	for (const providerId of options.providerIds ?? []) {
		if (!providerId) continue;
		providerIds.add(providerId);
	}

	for (const providerId of providerIds) {
		tags.push(
			`data:api_providers:${providerId}`,
			`api_provider:header:${providerId}`,
			`data:gateway_usage_rollups:provider:${providerId}`,
			`data:gateway_provider_health_states:provider:${providerId}`,
			`data:top_apps:provider:${providerId}`,
			`data:top_models:provider:${providerId}`,
		);
	}

	expireTagList(tags);
}

export function revalidateOrganisationDataTags(
	options: RevalidateOrganisationTagOptions = {}
) {
	const tags = ["data:organisations", "data:organisations:list"];

	const organisationIds = new Set<string>();
	if (options.organisationId) organisationIds.add(options.organisationId);
	for (const organisationId of options.organisationIds ?? []) {
		if (!organisationId) continue;
		organisationIds.add(organisationId);
	}

	for (const organisationId of organisationIds) {
		tags.push(
			`organisation:header:${organisationId}`,
			`data:organisations:${organisationId}`,
		);
	}

	expireTagList(tags);
}

export function revalidateAppDataTags(appIds: string[] = []) {
	const tags = [
		"data:apps",
		"data:app_details",
		"data:app_usage",
		"data:top_apps",
		"public-top-apps",
	];

	for (const appId of appIds) {
		if (!appId) continue;
		tags.push(`data:app_details:${appId}`, `data:app_usage:${appId}`);
	}

	expireTagList(tags);
}
