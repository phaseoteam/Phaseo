import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";
import { mapRawToModelCard, type ModelCard } from "@/lib/fetchers/models/getAllModels";
import { extractFeatureKeys } from "@/lib/fetchers/models/table-view/helpers";

export type ModelCollection = {
	id: string;
	title: string;
	description: string;
	hint?: string | null;
	models: ModelCard[];
};

const DEFAULT_LIMIT = 10;

type ModelRow = {
	model_id?: string | null;
	name?: string | null;
	status?: string | null;
	release_date?: string | null;
	announcement_date?: string | null;
	hidden?: boolean | null;
	organisation_id?: string | null;
	organisation?: {
		organisation_id?: string | null;
		name?: string | null;
		colour?: string | null;
	} | Array<{
		organisation_id?: string | null;
		name?: string | null;
		colour?: string | null;
	}> | null;
};

function normalizeModelRow(raw: unknown): ModelRow {
	const model = (raw ?? {}) as ModelRow;
	const organisation = Array.isArray(model.organisation)
		? model.organisation[0] ?? null
		: model.organisation ?? null;
	return {
		...model,
		organisation,
	};
}

function uniqueModels(models: ModelCard[], limit: number): ModelCard[] {
	const seen = new Set<string>();
	const result: ModelCard[] = [];
	for (const model of models) {
		if (!model.model_id || seen.has(model.model_id)) continue;
		seen.add(model.model_id);
		result.push(model);
		if (result.length >= limit) break;
	}
	return result;
}

function sortByReleaseDate(models: ModelCard[]): ModelCard[] {
	return [...models].sort((a, b) => {
		const aTime = a.primary_timestamp ?? 0;
		const bTime = b.primary_timestamp ?? 0;
		return bTime - aTime;
	});
}

function parseModelKey(modelKey?: string | null): { providerId: string; apiModelId: string } | null {
	if (!modelKey) return null;
	const parts = modelKey.split(":");
	if (parts.length < 3) return null;
	const providerId = parts.shift() ?? "";
	const apiModelId = parts.slice(0, -1).join(":");
	if (!providerId || !apiModelId) return null;
	return { providerId, apiModelId };
}

async function getBenchmarkTopModels(args: {
	benchmarkId: string;
	limit: number;
	includeHidden: boolean;
}): Promise<ModelCard[]> {
	const supabase = createAdminClient();
	const { data, error } = await supabase
		.from("data_benchmark_results")
		.select(
			`
      rank,
      model: data_models (
        model_id,
        name,
        status,
        release_date,
        announcement_date,
        hidden,
        organisation_id,
        organisation: data_organisations (
          organisation_id,
          name,
          colour
        )
      )
    `
		)
		.eq("benchmark_id", args.benchmarkId)
		.order("rank", { ascending: true })
		.limit(args.limit * 4);

	if (error) {
		// eslint-disable-next-line no-console
		console.warn("[collections] benchmark query failed", error.message);
		return [];
	}

	const mapped = (data ?? [])
		.map((row: any) => normalizeModelRow(row?.model))
		.filter((model) => {
			if (!model) return false;
			if (!args.includeHidden && model.hidden) return false;
			return true;
		})
		.map((model) => mapRawToModelCard(model));

	return uniqueModels(mapped, args.limit);
}

async function getImageGenerationModels(args: {
	limit: number;
	includeHidden: boolean;
}): Promise<ModelCard[]> {
	const supabase = createAdminClient();
	const { data, error } = await supabase
		.from("data_models")
		.select(
			`
      model_id,
      name,
      status,
      release_date,
      announcement_date,
      hidden,
      organisation_id,
      output_types,
      organisation: data_organisations (
        organisation_id,
        name,
        colour
      )
    `
		)
		.ilike("output_types", "%image%")
		.order("release_date", { ascending: false })
		.limit(args.limit * 4);

	if (error) {
		// eslint-disable-next-line no-console
		console.warn("[collections] image models query failed", error.message);
		return [];
	}

	const mapped = (data ?? [])
		.filter((model: any) => (args.includeHidden ? true : !model.hidden))
		.map((model: ModelRow) => mapRawToModelCard(normalizeModelRow(model)));

	return uniqueModels(sortByReleaseDate(mapped), args.limit);
}

async function getFreeModels(args: {
	limit: number;
	includeHidden: boolean;
}): Promise<ModelCard[]> {
	const supabase = createAdminClient();
	const [providerModelsRes, pricingRes] = await Promise.all([
		supabase
			.from("data_api_provider_models")
			.select(
				`
        provider_id,
        api_model_id,
        internal_model_id,
        provider_model_slug,
        is_active_gateway,
        model: data_models (
          model_id,
          name,
          status,
          release_date,
          announcement_date,
          hidden,
          organisation_id,
          organisation: data_organisations (
            organisation_id,
            name,
            colour
          )
        )
      `
			)
			.eq("is_active_gateway", true),
		supabase
			.from("data_api_pricing_rules")
			.select("model_key, price_per_unit, pricing_plan")
			.or("price_per_unit.eq.0,pricing_plan.ilike.%free%"),
	]);

	if (providerModelsRes.error) {
		// eslint-disable-next-line no-console
		console.warn("[collections] provider models query failed", providerModelsRes.error.message);
		return [];
	}

	const providerModels = providerModelsRes.data ?? [];
	const pricingRows = pricingRes.data ?? [];
	const providerByKey = new Map<string, ModelRow>();

	for (const row of providerModels) {
		if (!row?.provider_id || !row?.api_model_id) continue;
		const modelRow = normalizeModelRow(
			Array.isArray(row.model) ? row.model[0] : row.model
		);
		if (!modelRow) continue;
		if (!args.includeHidden && modelRow.hidden) continue;
		const key = `${row.provider_id}:${row.api_model_id}`;
		providerByKey.set(key, modelRow);
		if (
			String(row.api_model_id).includes(":free") ||
			String(row.provider_model_slug ?? "").toLowerCase().includes("free")
		) {
			providerByKey.set(key + ":free", modelRow);
		}
	}

	const freeModels: ModelCard[] = [];
	for (const pricing of pricingRows) {
		const parsed = parseModelKey(pricing.model_key ?? null);
		if (!parsed) continue;
		const directKey = `${parsed.providerId}:${parsed.apiModelId}`;
		const modelRow = providerByKey.get(directKey) ?? null;
		if (modelRow) {
			freeModels.push(mapRawToModelCard(modelRow));
		}
	}

	for (const [key, modelRow] of providerByKey.entries()) {
		if (!key.includes(":free")) continue;
		freeModels.push(mapRawToModelCard(modelRow));
	}

	return uniqueModels(sortByReleaseDate(freeModels), args.limit);
}

async function getToolModels(args: {
	limit: number;
	includeHidden: boolean;
}): Promise<ModelCard[]> {
	const supabase = createAdminClient();
	const { data, error } = await supabase
		.from("data_api_provider_model_capabilities")
		.select(
			`
      params,
      provider_model: data_api_provider_models!inner (
        provider_id,
        api_model_id,
        internal_model_id,
        is_active_gateway,
        model: data_models!data_api_provider_models_internal_model_id_fkey (
          model_id,
          name,
          status,
          release_date,
          announcement_date,
          hidden,
          organisation_id,
          organisation: data_organisations!data_models_organisation_id_fkey (
            organisation_id,
            name,
            colour
          )
        )
      )
    `
		)
		.eq("status", "active");

	if (error) {
		// eslint-disable-next-line no-console
		console.warn("[collections] tool models query failed", error.message);
		return [];
	}

	const toolModels: ModelCard[] = [];
	for (const row of data ?? []) {
		const providerModel = Array.isArray(row.provider_model)
			? row.provider_model[0]
			: row.provider_model;
		if (!providerModel?.is_active_gateway) continue;
		const modelRow = Array.isArray(providerModel.model)
			? providerModel.model[0]
			: providerModel.model;
		if (!modelRow) continue;
		const normalizedModel = normalizeModelRow(modelRow);
		if (!args.includeHidden && normalizedModel.hidden) continue;
		const features = extractFeatureKeys(row.params ?? {});
		if (!features.includes("tools")) continue;
		toolModels.push(mapRawToModelCard(normalizedModel));
	}

	return uniqueModels(sortByReleaseDate(toolModels), args.limit);
}

export async function getModelCollections(limit = DEFAULT_LIMIT): Promise<ModelCollection[]> {
	"use cache";

	cacheLife("hours");
	cacheTag("collections");

	const includeHidden = false;

	const [
		freeModels,
		imageModels,
		toolModels,
		codingModels,
		imageUnderstandingModels,
	] = await Promise.all([
		getFreeModels({ limit, includeHidden }),
		getImageGenerationModels({ limit, includeHidden }),
		getToolModels({ limit, includeHidden }),
		getBenchmarkTopModels({
			benchmarkId: "aider-polyglot",
			limit,
			includeHidden,
		}),
		getBenchmarkTopModels({
			benchmarkId: "mmmu",
			limit,
			includeHidden,
		}),
	]);

	return [
		{
			id: "free",
			title: "Free models",
			description: "Zero-cost or free-tier models across providers.",
			models: freeModels,
		},
		{
			id: "image-generation",
			title: "Image generation",
			description: "Models that can generate or edit images.",
			models: imageModels,
		},
		{
			id: "tools",
			title: "Tool calling",
			description: "Models with native tool/function calling support.",
			models: toolModels,
		},
		{
			id: "coding",
			title: "Best coding models",
			description: "Top-ranked models for code generation.",
			hint: "Based on Aider Polyglot benchmark rankings.",
			models: codingModels,
		},
		{
			id: "image-understanding",
			title: "Best image understanding",
			description: "Top-ranked models for multimodal reasoning.",
			hint: "Based on MMMU benchmark rankings.",
			models: imageUnderstandingModels,
		},
	];
}
