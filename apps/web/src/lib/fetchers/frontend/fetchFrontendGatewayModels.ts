import { cacheLife, cacheTag } from "next/cache";
import {
	GATEWAY_MODEL_LIST_TAGS,
	MODEL_ALIAS_TAGS,
	PUBLIC_MODEL_CATALOGUE_CACHE_LIFE,
} from "@/lib/cache/publicModelCatalogueTags";
import { createAdminClient } from "@/utils/supabase/admin";
import {
	type GatewaySupportedModel,
	getGatewaySupportedModels,
} from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import { fetchFrontendModels } from "@/lib/fetchers/frontend/fetchPublicCatalog";

function isProductionBuild() {
	return process.env.NEXT_PHASE === "phase-production-build";
}

export async function fetchFrontendGatewayModels(): Promise<GatewaySupportedModel[]> {
	"use cache";

	cacheLife(PUBLIC_MODEL_CATALOGUE_CACHE_LIFE);
	for (const tag of GATEWAY_MODEL_LIST_TAGS) {
		cacheTag(tag);
	}

	try {
		const models = await fetchFrontendModels();
		return models
			.flatMap((model) =>
				(model.gateway_supported_models ?? []).map((gatewayModel) => ({
					...gatewayModel,
					modelPageNotice: model.model_page_notice ?? null,
				})),
			)
			.filter((model) => model.isAvailable);
	} catch (error) {
		if (!isProductionBuild()) throw error;
		const models = await getGatewaySupportedModels(false);
		return models.filter((model) => model.isAvailable);
	}
}

function titleCaseAliasPart(value: string) {
	return value
		.split(/[-_\s]+/)
		.filter(Boolean)
		.map((part) => {
			const lower = part.toLowerCase();
			if (["ai", "gpt", "glm"].includes(lower)) return lower.toUpperCase();
			return `${lower.slice(0, 1).toUpperCase()}${lower.slice(1)}`;
		})
		.join(" ");
}

function formatAliasName(aliasSlug: string) {
	const [orgId, ...modelParts] = aliasSlug.split("/");
	const orgName = titleCaseAliasPart(orgId ?? "");
	const modelName = titleCaseAliasPart(modelParts.join("/") || aliasSlug);
	return [orgName, modelName].filter(Boolean).join(" ");
}

export async function fetchFrontendGatewayModelAliases(
	baseModels?: GatewaySupportedModel[],
): Promise<GatewaySupportedModel[]> {
	"use cache";

	cacheLife(PUBLIC_MODEL_CATALOGUE_CACHE_LIFE);
	for (const tag of MODEL_ALIAS_TAGS) {
		cacheTag(tag);
	}

	let models = baseModels;
	if (!models) {
		models = await fetchFrontendGatewayModels();
	}

	const activeByModelId = new Map<string, GatewaySupportedModel[]>();
	for (const model of models) {
		if (!model.isAvailable) continue;
		for (const id of [
			model.modelId,
			model.selectorModelId,
			model.internalModelId,
		]) {
			if (!id) continue;
			activeByModelId.set(id, [
				...(activeByModelId.get(id) ?? []),
				model,
			]);
		}
	}

	let client: ReturnType<typeof createAdminClient> | null = null;
	try {
		client = createAdminClient();
	} catch (error) {
		if (!isProductionBuild()) throw error;
		return [];
	}

	const { data, error } = await client
		.from("data_api_model_aliases")
		.select("alias_slug, api_model_id")
		.eq("is_enabled", true)
		.order("alias_slug", { ascending: true });

	if (error) {
		if (!isProductionBuild()) {
			throw new Error(error.message ?? "Failed to load model aliases");
		}
		return [];
	}

	const seen = new Set<string>();
	const aliases: GatewaySupportedModel[] = [];
	for (const row of data ?? []) {
		const aliasSlug =
			typeof row.alias_slug === "string" ? row.alias_slug.trim() : "";
		const apiModelId =
			typeof row.api_model_id === "string" ? row.api_model_id.trim() : "";
		if (!aliasSlug || !apiModelId || seen.has(aliasSlug)) continue;
		const [resolved] = activeByModelId.get(apiModelId) ?? [];
		if (!resolved) continue;
		seen.add(aliasSlug);
		aliases.push({
			...resolved,
			modelId: aliasSlug,
			selectorModelId: aliasSlug,
			modelName: formatAliasName(aliasSlug),
		});
	}

	return aliases;
}
