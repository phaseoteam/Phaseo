import { revalidateTag } from "next/cache";

const EXPIRE_NOW = { expire: 0 } as const;

type RevalidateModelDataTagOptions = {
	modelId?: string | null;
	organisationIds?: Array<string | null | undefined>;
};

const MODEL_DATA_GLOBAL_TAGS = [
	"audit-models",
	"search:data",
	"data:model-updates",
	"data:models",
	"data:organisations",
	"data:families",
	"data:benchmarks",
	"data:sign-in:models",
	"data:sign-in:supported-models-stats",
	"landing:db-stats",
	"page:models",
	"public-rankings",
] as const;

const MODEL_API_GLOBAL_TAGS = [
	"data:api_providers",
	"data:model_aliases",
	"data:data_api_provider_models",
	"data:data_api_pricing_rules",
	"monitor-models",
	"page:models",
] as const;

function revalidateTagList(tags: readonly string[]) {
	for (const tag of tags) {
		revalidateTag(tag, EXPIRE_NOW);
	}
}

export function revalidateModelDataOnlyTags(
	options: RevalidateModelDataTagOptions = {}
) {
	revalidateTagList(MODEL_DATA_GLOBAL_TAGS);

	for (const organisationId of options.organisationIds ?? []) {
		if (!organisationId) continue;
		revalidateTag(`organisation:header:${organisationId}`, EXPIRE_NOW);
	}

	if (options.modelId) {
		revalidateTag(`model:data:${options.modelId}`, EXPIRE_NOW);
		revalidateTag(`model:header:${options.modelId}`, EXPIRE_NOW);
		revalidateTag(`data:models:${options.modelId}`, EXPIRE_NOW);
		revalidateTag(`data:benchmarks:model:${options.modelId}`, EXPIRE_NOW);
		revalidateTag(
			`model:benchmarks:highlights:${options.modelId}`,
			EXPIRE_NOW
		);
		revalidateTag(`model:benchmarks:table:${options.modelId}`, EXPIRE_NOW);
		revalidateTag(
			`model:benchmarks:comparisons:${options.modelId}`,
			EXPIRE_NOW
		);
	}
}

export function revalidateModelApiInfoTags(
	options: RevalidateModelDataTagOptions = {}
) {
	revalidateTagList(MODEL_API_GLOBAL_TAGS);

	if (options.modelId) {
		revalidateTag(`model:api:${options.modelId}`, EXPIRE_NOW);
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

export function revalidateAppDataTags(appIds: string[] = []) {
	revalidateTag("data:apps", EXPIRE_NOW);
	revalidateTag("data:app_details", EXPIRE_NOW);
	revalidateTag("data:app_usage", EXPIRE_NOW);
	revalidateTag("data:top_apps", EXPIRE_NOW);
	revalidateTag("public-top-apps", EXPIRE_NOW);

	for (const appId of appIds) {
		if (!appId) continue;
		revalidateTag(`data:app_details:${appId}`, EXPIRE_NOW);
		revalidateTag(`data:app_usage:${appId}`, EXPIRE_NOW);
	}
}
