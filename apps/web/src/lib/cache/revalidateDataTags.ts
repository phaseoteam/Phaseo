import { revalidatePath, revalidateTag, updateTag } from "next/cache";

const STALE_WHILE_REVALIDATE = "max" as const;
const EXPIRE_IMMEDIATELY = { expire: 0 } as const;

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

function revalidateTagList(tags: readonly string[]) {
	for (const tag of tags) {
		revalidateTag(tag, STALE_WHILE_REVALIDATE);
	}
}

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
		revalidatePath(`/models/${options.modelId}`);
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
	revalidateTagList(MODEL_DATA_GLOBAL_TAGS);

	for (const organisationId of options.organisationIds ?? []) {
		if (!organisationId) continue;
		revalidateTag(
			`organisation:header:${organisationId}`,
			STALE_WHILE_REVALIDATE
		);
		revalidateTag(
			`data:organisations:${organisationId}`,
			STALE_WHILE_REVALIDATE
		);
	}

	if (options.modelId) {
		revalidateTag(`model:data:${options.modelId}`, STALE_WHILE_REVALIDATE);
		revalidateTag(`model:header:${options.modelId}`, STALE_WHILE_REVALIDATE);
		revalidateTag(`data:models:${options.modelId}`, STALE_WHILE_REVALIDATE);
		revalidateTag(
			`data:benchmarks:model:${options.modelId}`,
			STALE_WHILE_REVALIDATE
		);
		revalidateTag(
			`model:benchmarks:highlights:${options.modelId}`,
			STALE_WHILE_REVALIDATE
		);
		revalidateTag(
			`model:benchmarks:table:${options.modelId}`,
			STALE_WHILE_REVALIDATE
		);
		revalidateTag(
			`model:benchmarks:comparisons:${options.modelId}`,
			STALE_WHILE_REVALIDATE
		);
	}

	for (const benchmarkId of options.benchmarkIds ?? []) {
		if (!benchmarkId) continue;
		revalidateTag(`data:benchmarks:${benchmarkId}`, STALE_WHILE_REVALIDATE);
		if (options.modelId) {
			revalidateTag(
				`data:benchmarks:model:${options.modelId}:benchmark:${benchmarkId}`,
				STALE_WHILE_REVALIDATE
			);
		}
	}
}

export function revalidateModelApiInfoTags(
	options: RevalidateModelDataTagOptions = {}
) {
	const hasModelScope = Boolean(options.modelId);
	if (!hasModelScope) {
		revalidateTagList(MODEL_API_GLOBAL_TAGS);
		for (const tag of MODEL_CANONICAL_RESOLVER_TAGS) {
			revalidateTag(tag, EXPIRE_IMMEDIATELY);
		}
	}

	if (options.modelId) {
		revalidateTag(`model:canonical:${options.modelId}`, EXPIRE_IMMEDIATELY);
		revalidateTag(`model:api:${options.modelId}`, STALE_WHILE_REVALIDATE);
		revalidateTag(
			`model:pricing-history:${options.modelId}`,
			STALE_WHILE_REVALIDATE
		);
		revalidateTag(
			`model:performance:${options.modelId}`,
			STALE_WHILE_REVALIDATE
		);
		revalidateTag(`data:model_apps:${options.modelId}`, STALE_WHILE_REVALIDATE);
		revalidateTag(
			`data:gateway_requests:model:${options.modelId}`,
			STALE_WHILE_REVALIDATE
		);
		revalidateTag(
			`data:gateway_usage_rollups:model:${options.modelId}`,
			STALE_WHILE_REVALIDATE
		);
	}
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
	revalidateTag("data:benchmarks", STALE_WHILE_REVALIDATE);
	revalidateTag("data:benchmarks:list", STALE_WHILE_REVALIDATE);
	if (options.modelId) {
		revalidateTag(
			`data:benchmarks:model:${options.modelId}`,
			STALE_WHILE_REVALIDATE
		);
		revalidateTag(
			`model:benchmarks:highlights:${options.modelId}`,
			STALE_WHILE_REVALIDATE
		);
		revalidateTag(
			`model:benchmarks:table:${options.modelId}`,
			STALE_WHILE_REVALIDATE
		);
		revalidateTag(
			`model:benchmarks:comparisons:${options.modelId}`,
			STALE_WHILE_REVALIDATE
		);
	}

	const benchmarkIds = new Set<string>();
	if (options.benchmarkId) benchmarkIds.add(options.benchmarkId);
	for (const benchmarkId of options.benchmarkIds ?? []) {
		if (!benchmarkId) continue;
		benchmarkIds.add(benchmarkId);
	}

	for (const benchmarkId of benchmarkIds) {
		revalidateTag(`data:benchmarks:${benchmarkId}`, STALE_WHILE_REVALIDATE);
		if (options.modelId) {
			revalidateTag(
				`data:benchmarks:model:${options.modelId}:benchmark:${benchmarkId}`,
				STALE_WHILE_REVALIDATE
			);
		}
	}
}

export function revalidateProviderDataTags(
	options: RevalidateProviderTagOptions = {}
) {
	revalidateTagList(MODEL_API_GLOBAL_TAGS);

	const providerIds = new Set<string>();
	if (options.providerId) providerIds.add(options.providerId);
	for (const providerId of options.providerIds ?? []) {
		if (!providerId) continue;
		providerIds.add(providerId);
	}

	for (const providerId of providerIds) {
		revalidateTag(`data:api_providers:${providerId}`, STALE_WHILE_REVALIDATE);
		revalidateTag(`api_provider:header:${providerId}`, STALE_WHILE_REVALIDATE);
		revalidateTag(
			`data:gateway_usage_rollups:provider:${providerId}`,
			STALE_WHILE_REVALIDATE
		);
		revalidateTag(
			`data:gateway_provider_health_states:provider:${providerId}`,
			STALE_WHILE_REVALIDATE
		);
		revalidateTag(`data:top_apps:provider:${providerId}`, STALE_WHILE_REVALIDATE);
		revalidateTag(
			`data:top_models:provider:${providerId}`,
			STALE_WHILE_REVALIDATE
		);
	}
}

export function revalidateOrganisationDataTags(
	options: RevalidateOrganisationTagOptions = {}
) {
	revalidateTag("data:organisations", STALE_WHILE_REVALIDATE);
	revalidateTag("data:organisations:list", STALE_WHILE_REVALIDATE);

	const organisationIds = new Set<string>();
	if (options.organisationId) organisationIds.add(options.organisationId);
	for (const organisationId of options.organisationIds ?? []) {
		if (!organisationId) continue;
		organisationIds.add(organisationId);
	}

	for (const organisationId of organisationIds) {
		revalidateTag(
			`organisation:header:${organisationId}`,
			STALE_WHILE_REVALIDATE
		);
		revalidateTag(
			`data:organisations:${organisationId}`,
			STALE_WHILE_REVALIDATE
		);
	}
}

export function revalidateAppDataTags(appIds: string[] = []) {
	revalidateTag("data:apps", STALE_WHILE_REVALIDATE);
	revalidateTag("data:app_details", STALE_WHILE_REVALIDATE);
	revalidateTag("data:app_usage", STALE_WHILE_REVALIDATE);
	revalidateTag("data:top_apps", STALE_WHILE_REVALIDATE);
	revalidateTag("public-top-apps", STALE_WHILE_REVALIDATE);

	for (const appId of appIds) {
		if (!appId) continue;
		revalidateTag(`data:app_details:${appId}`, STALE_WHILE_REVALIDATE);
		revalidateTag(`data:app_usage:${appId}`, STALE_WHILE_REVALIDATE);
	}
}
