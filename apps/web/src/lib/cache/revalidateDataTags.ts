import { revalidateTag } from "next/cache";

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
	"data:models",
	"data:organisations",
	"data:organisations:list",
	"data:families",
	"data:benchmarks",
	"data:benchmarks:list",
	"data:sign-in:models",
	"data:sign-in:supported-models-stats",
	"landing:db-stats",
	"page:models",
	"public-rankings",
] as const;

const MODEL_API_GLOBAL_TAGS = [
	"data:api_providers",
	"data:api_providers:list",
	"data:model_aliases",
	"data:data_api_provider_models",
	"data:data_model_id_redirects",
	"data:data_api_models",
	"data:data_api_pricing_rules",
	"data:gateway_requests",
	"data:gateway_usage_rollups",
	"data:gateway_provider_health_states",
	"data:top_apps",
	"data:top_models",
	"monitor-models",
	"page:models",
] as const;

const MODEL_CANONICAL_RESOLVER_TAGS = [
	"data:models",
	"data:model_aliases",
	"data:data_api_provider_models",
	"data:data_model_id_redirects",
	"data:data_api_models",
] as const;

function revalidateTagList(tags: readonly string[]) {
	for (const tag of tags) {
		revalidateTag(tag, STALE_WHILE_REVALIDATE);
	}
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
	}
	for (const tag of MODEL_CANONICAL_RESOLVER_TAGS) {
		revalidateTag(tag, EXPIRE_IMMEDIATELY);
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
