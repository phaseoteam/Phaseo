import { revalidateTag } from "next/cache";

const EXPIRE_NOW = { expire: 0 } as const;

type RevalidateModelDataTagOptions = {
	modelId?: string | null;
	organisationIds?: Array<string | null | undefined>;
};

export function revalidateModelDataTags(
	options: RevalidateModelDataTagOptions = {}
) {
	revalidateTag("audit-models", EXPIRE_NOW);
	revalidateTag("search:data", EXPIRE_NOW);
	revalidateTag("data:model-updates", EXPIRE_NOW);
	revalidateTag("data:models", EXPIRE_NOW);
	revalidateTag("data:organisations", EXPIRE_NOW);
	revalidateTag("data:api_providers", EXPIRE_NOW);
	revalidateTag("data:families", EXPIRE_NOW);
	revalidateTag("data:model_aliases", EXPIRE_NOW);
	revalidateTag("data:data_api_provider_models", EXPIRE_NOW);
	revalidateTag("data:data_api_pricing_rules", EXPIRE_NOW);
	revalidateTag("data:benchmarks", EXPIRE_NOW);
	revalidateTag("data:sign-in:models", EXPIRE_NOW);
	revalidateTag("data:sign-in:supported-models-stats", EXPIRE_NOW);
	revalidateTag("landing:db-stats", EXPIRE_NOW);

	for (const organisationId of options.organisationIds ?? []) {
		if (!organisationId) continue;
		revalidateTag(`organisation:header:${organisationId}`, EXPIRE_NOW);
	}

	if (options.modelId) {
		revalidateTag(`model:header:${options.modelId}`, EXPIRE_NOW);
		revalidateTag(`data:models:${options.modelId}`, EXPIRE_NOW);
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
