// lib/fetchers/api-providers/getAPIProvider.ts
import { cacheLife, cacheTag } from "next/cache";
import { createClient } from "@/utils/supabase/client";
import { applyHiddenFilter } from "@/lib/fetchers/models/visibility";
import {
	filterVisibleAPIProviders,
	isAPIProviderHidden,
} from "./visibility";

export interface APIProvider {
	api_provider_id: string;
	api_provider_name: string;
}

export interface APIProviderModels {
	model_id: string;
	model_name: string;
	provider_model_slug?: string | null;
	endpoints?: string[] | null;
	is_active_gateway?: boolean | null;
	input_modalities?: string[] | string | null;
	output_modalities?: string[] | string | null;
	release_date?: string | null;
}

export interface APIProviderModelListItem extends APIProviderModels {
	api_model_id: string;
	created_at: string | null;
	supported_params?: string[] | null;
	input_price_per_1m_usd?: number | null;
	output_price_per_1m_usd?: number | null;
	starting_price_usd?: number | null;
	starting_price_unit?: string | null;
}

export type ModelOutputType =
	| "text"
	| "image"
	| "video"
	| "audio"
	| "embeddings"
	| "moderations";

function parseModalities(value?: string[] | string | null): string[] {
	if (!value) return [];
	if (Array.isArray(value)) {
		return value.map((item) => String(item).trim()).filter(Boolean);
	}
	return value
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
}

function mergeUniqueStrings(base: string[], next: string[]): string[] {
	return Array.from(new Set([...base, ...next]));
}

function extractSupportedParams(value: unknown): string[] {
	if (!value || typeof value !== "object" || Array.isArray(value)) return [];
	return Object.keys(value as Record<string, unknown>)
		.map((key) => key.trim())
		.filter(Boolean);
}

type PricingRuleRow = {
	model_key: string;
	pricing_plan: string | null;
	meter: string | null;
	unit: string | null;
	unit_size: number | null;
	price_per_unit: number | null;
	effective_from: string | null;
	effective_to: string | null;
	priority: number | null;
};

function isCurrentPricingRule(rule: PricingRuleRow, now = new Date()): boolean {
	const nowMs = now.getTime();
	if (rule.effective_from) {
		const fromMs = new Date(rule.effective_from).getTime();
		if (Number.isFinite(fromMs) && fromMs > nowMs) return false;
	}
	if (rule.effective_to) {
		const toMs = new Date(rule.effective_to).getTime();
		if (Number.isFinite(toMs) && toMs <= nowMs) return false;
	}
	return true;
}

function toPerMillionUsd(rule: PricingRuleRow): number | null {
	const unit = String(rule.unit ?? "").toLowerCase();
	if (unit !== "token") return null;
	const pricePerUnit = Number(rule.price_per_unit ?? NaN);
	if (!Number.isFinite(pricePerUnit)) return null;
	const unitSize = Number(rule.unit_size ?? 1);
	if (!Number.isFinite(unitSize) || unitSize <= 0) return null;
	return (pricePerUnit / unitSize) * 1_000_000;
}

function toBasicUnitLabel(rule: PricingRuleRow): string | null {
	const unit = String(rule.unit ?? "").toLowerCase().trim();
	if (!unit) return null;
	const unitSize = Number(rule.unit_size ?? 1);
	if (unit === "token") return "1M tokens";
	if (!Number.isFinite(unitSize) || unitSize <= 1) return unit;
	return `${unitSize} ${unit}s`;
}

export async function getAPIProvider(): Promise<APIProvider[]> {
	const supabase = await createClient();

	const { data, error } = await supabase
		.from("data_api_providers")
		.select("api_provider_id, api_provider_name, country_code")
		.order("api_provider_name", { ascending: true });

	if (error) {
		throw error;
	}

	if (!data || !Array.isArray(data)) return [];

	return filterVisibleAPIProviders(
		data
			.map((r: any) => ({
				api_provider_id: r.api_provider_id,
				api_provider_name: r.api_provider_name ?? r.name ?? "",
				country_code: r.country_code ?? null,
			}))
			.filter((p) => p.api_provider_id),
	);
}

export async function getAPIProviderPricesCached(): Promise<APIProvider[]> {
	"use cache";

	cacheLife("days");
	cacheTag("data:api_providers");

	console.log("[fetch] HIT JSON for API providers");
	return getAPIProvider();
}

// -------------------------- GET MODELS BY TYPE -------------------------- //

/**
 * Generic function for fetching models for a provider filtered by output modality.
 */
export async function getAPIProviderModels(
	apiProviderId: string,
	outputType: ModelOutputType,
	includeHidden: boolean,
): Promise<APIProviderModels[]> {
	if (isAPIProviderHidden(apiProviderId)) {
		return [];
	}

	const modalityLookup: Record<ModelOutputType, string> = {
		text: "text",
		image: "image",
		video: "video",
		audio: "audio",
		embeddings: "embedding",
		moderations: "moderations",
	};

	const modality = modalityLookup[outputType];
	if (!modality) {
		throw new Error(`Unsupported output type: ${outputType}`);
	}

	const supabase = await createClient();
	const { data: providerModels, error: modelsError } = await supabase
		.from("data_api_provider_models")
		.select(`
            provider_api_model_id,
            provider_id,
            api_model_id,
            provider_model_slug,
            internal_model_id,
            is_active_gateway,
            input_modalities,
            output_modalities
        `)
		.eq("provider_id", apiProviderId);

	if (modelsError) {
		throw modelsError;
	}

	if (!providerModels || !Array.isArray(providerModels)) return [];

	const providerModelIds = providerModels
		.map((row) => row.provider_api_model_id)
		.filter((id): id is string => Boolean(id));

	const capsResponse = providerModelIds.length
		? await supabase
				.from("data_api_provider_model_capabilities")
				.select("provider_api_model_id, capability_id, params, status")
				.in("provider_api_model_id", providerModelIds)
		: { data: [], error: null };

	if (capsResponse.error) {
		throw capsResponse.error;
	}

	const internalIds = Array.from(
		new Set(providerModels.map((row) => row.internal_model_id).filter(Boolean)),
	);
	const modelsResponse = internalIds.length
		? await applyHiddenFilter(
				supabase
					.from("data_models")
					.select("model_id, name, release_date, hidden")
					.in("model_id", internalIds),
				includeHidden,
			)
		: { data: [] as any[] };

	const modelMapById = new Map<
		string,
		{ name: string | null; release_date: string | null }
	>();
	const visibleInternalIds = new Set<string>();
	for (const model of modelsResponse.data ?? []) {
		if (!model.model_id) continue;
		visibleInternalIds.add(model.model_id);
		modelMapById.set(model.model_id, {
			name: model.name ?? null,
			release_date: model.release_date ?? null,
		});
	}

	const capMap = new Map<string, string[]>();
	const paramsMap = new Map<string, string[]>();
	for (const cap of capsResponse.data ?? []) {
		if (cap.status === "disabled") continue;
		if (!cap.provider_api_model_id || !cap.capability_id) continue;
		const list = capMap.get(cap.provider_api_model_id) ?? [];
		if (!list.includes(cap.capability_id)) list.push(cap.capability_id);
		capMap.set(cap.provider_api_model_id, list);
		const supportedParams = extractSupportedParams((cap as any).params);
		const existingParams = paramsMap.get(cap.provider_api_model_id) ?? [];
		paramsMap.set(
			cap.provider_api_model_id,
			mergeUniqueStrings(existingParams, supportedParams),
		);
	}

	const modelsData = providerModels
		.filter((row: any) => {
			if (includeHidden) return true;
			if (!row.internal_model_id) return true;
			return visibleInternalIds.has(row.internal_model_id);
		})
		.map((row: any) => {
			const modelInfo = row.internal_model_id
				? modelMapById.get(row.internal_model_id)
				: null;
			return {
				...row,
				data_models: modelInfo,
				endpoints: capMap.get(row.provider_api_model_id) ?? [],
			};
		});

	const filteredModels = modelsData.filter((row: any) => {
		const outputs = parseModalities(row.output_modalities);
		return outputs.some((item: string) => item.toLowerCase().includes(modality));
	});

	const modelMap: Map<string, APIProviderModels> = new Map();
	for (const r of filteredModels) {
		const model_id = r.internal_model_id;
		if (!model_id) continue;
		const endpoints = Array.isArray(r.endpoints) ? r.endpoints : [];
		if (!modelMap.has(model_id)) {
			modelMap.set(model_id, {
				model_id,
				model_name: r.data_models?.name ?? r.model_name ?? "",
				provider_model_slug: r.provider_model_slug ?? null,
				endpoints,
				is_active_gateway: r.is_active_gateway ?? null,
				input_modalities: r.input_modalities ?? null,
				output_modalities: r.output_modalities ?? null,
				release_date: r.data_models?.release_date ?? null,
			});
		} else {
			const existing = modelMap.get(model_id)!;
			for (const endpoint of endpoints) {
				if (endpoint && !existing.endpoints!.includes(endpoint)) {
					existing.endpoints!.push(endpoint);
				}
			}
		}
	}

	const results: APIProviderModels[] = Array.from(modelMap.values()).filter(
		(m) => m.model_id,
	);

	results.sort((a, b) => {
		const aDate = a.release_date ?? null;
		const bDate = b.release_date ?? null;

		const aTime = aDate
			? new Date(aDate).getTime()
			: Number.NEGATIVE_INFINITY;
		const bTime = bDate
			? new Date(bDate).getTime()
			: Number.NEGATIVE_INFINITY;

		if (aTime === bTime) {
			return a.model_name.localeCompare(b.model_name);
		}

		return bTime - aTime;
	});

	return results;
}

export async function getAPIProviderModelsCached(
	apiProviderId: string,
	outputType: ModelOutputType,
	includeHidden: boolean,
): Promise<APIProviderModels[]> {
	"use cache";

	cacheLife("days");
	cacheTag("data:api_providers");

	console.log(
		`[fetch] HIT JSON for API providers - ${apiProviderId} / ${outputType}`,
	);
	return getAPIProviderModels(apiProviderId, outputType, includeHidden);
}

// Backwards-compatible wrappers for previous specific functions
export async function getAPIProviderTextModels(
	apiProviderId: string,
	includeHidden: boolean,
): Promise<APIProviderModels[]> {
	return getAPIProviderModels(apiProviderId, "text", includeHidden);
}

export async function getAPIProviderTextModelsCached(
	apiProviderId: string,
	includeHidden: boolean,
): Promise<APIProviderModels[]> {
	"use cache";

	cacheLife("days");
	cacheTag("data:api_providers");

	return getAPIProviderModels(apiProviderId, "text", includeHidden);
}

export async function getAPIProviderImageModels(
	apiProviderId: string,
	includeHidden: boolean,
): Promise<APIProviderModels[]> {
	return getAPIProviderModels(apiProviderId, "image", includeHidden);
}

export async function getAPIProviderImageModelsCached(
	apiProviderId: string,
	includeHidden: boolean,
): Promise<APIProviderModels[]> {
	"use cache";

	cacheLife("days");
	cacheTag("data:api_providers");

	return getAPIProviderModels(apiProviderId, "image", includeHidden);
}

export async function getAPIProviderModelsListByAdded(
	apiProviderId: string,
	includeHidden: boolean,
): Promise<APIProviderModelListItem[]> {
	if (isAPIProviderHidden(apiProviderId)) {
		return [];
	}

	const supabase = await createClient();
	const { data: providerModels, error: modelsError } = await supabase
		.from("data_api_provider_models")
		.select(`
            provider_api_model_id,
            provider_id,
            api_model_id,
            provider_model_slug,
            internal_model_id,
            is_active_gateway,
            input_modalities,
            output_modalities,
            created_at
        `)
		.eq("provider_id", apiProviderId)
		.order("created_at", { ascending: false });

	if (modelsError) {
		throw modelsError;
	}

	if (!providerModels || !Array.isArray(providerModels)) return [];

	const providerModelIds = providerModels
		.map((row) => row.provider_api_model_id)
		.filter((id): id is string => Boolean(id));

	const capsResponse = providerModelIds.length
		? await supabase
				.from("data_api_provider_model_capabilities")
				.select("provider_api_model_id, capability_id, params, status")
				.in("provider_api_model_id", providerModelIds)
		: { data: [], error: null };

	if (capsResponse.error) {
		throw capsResponse.error;
	}

	const internalIds = Array.from(
		new Set(providerModels.map((row) => row.internal_model_id).filter(Boolean)),
	);
	const modelsResponse = internalIds.length
		? await applyHiddenFilter(
				supabase
					.from("data_models")
					.select("model_id, name, hidden")
					.in("model_id", internalIds),
				includeHidden,
			)
		: { data: [] as any[] };

	const modelMapById = new Map<string, { name: string | null }>();
	const visibleInternalIds = new Set<string>();
	for (const model of modelsResponse.data ?? []) {
		if (!model.model_id) continue;
		visibleInternalIds.add(model.model_id);
		modelMapById.set(model.model_id, {
			name: model.name ?? null,
		});
	}

	const capMap = new Map<string, string[]>();
	const paramsMap = new Map<string, string[]>();
	for (const cap of capsResponse.data ?? []) {
		if (cap.status === "disabled") continue;
		if (!cap.provider_api_model_id || !cap.capability_id) continue;
		const list = capMap.get(cap.provider_api_model_id) ?? [];
		if (!list.includes(cap.capability_id)) list.push(cap.capability_id);
		capMap.set(cap.provider_api_model_id, list);
		const supportedParams = extractSupportedParams((cap as any).params);
		const existingParams = paramsMap.get(cap.provider_api_model_id) ?? [];
		paramsMap.set(
			cap.provider_api_model_id,
			mergeUniqueStrings(existingParams, supportedParams),
		);
	}

	const mergedByModelId = new Map<string, APIProviderModelListItem>();
	const apiModelIdsByModelId = new Map<string, Set<string>>();

	for (const row of providerModels as any[]) {
		if (
			!includeHidden &&
			row.internal_model_id &&
			!visibleInternalIds.has(row.internal_model_id)
		) {
			continue;
		}

		const modelId = row.internal_model_id || row.api_model_id;
		if (!modelId) continue;
		const apiModelId = String(row.api_model_id ?? "").trim();
		if (apiModelId) {
			const set = apiModelIdsByModelId.get(modelId) ?? new Set<string>();
			set.add(apiModelId);
			apiModelIdsByModelId.set(modelId, set);
		}

		const createdAt = row.created_at ?? null;
		const endpoints = capMap.get(row.provider_api_model_id) ?? [];
		const supportedParams = paramsMap.get(row.provider_api_model_id) ?? [];
		const inputModalities = parseModalities(row.input_modalities);
		const outputModalities = parseModalities(row.output_modalities);
		const existing = mergedByModelId.get(modelId);

		if (!existing) {
			mergedByModelId.set(modelId, {
				model_id: modelId,
				api_model_id: row.api_model_id ?? modelId,
				model_name:
					modelMapById.get(row.internal_model_id ?? "")?.name ??
					row.provider_model_slug ??
					row.api_model_id ??
					modelId,
				provider_model_slug: row.provider_model_slug ?? null,
				endpoints,
				supported_params: supportedParams,
				is_active_gateway: Boolean(row.is_active_gateway),
				input_modalities: inputModalities,
				output_modalities: outputModalities,
				created_at: createdAt,
			});
			continue;
		}

		const existingTs = existing.created_at
			? new Date(existing.created_at).getTime()
			: Number.NEGATIVE_INFINITY;
		const nextTs = createdAt
			? new Date(createdAt).getTime()
			: Number.NEGATIVE_INFINITY;
		if (nextTs > existingTs) {
			existing.created_at = createdAt;
		}
		existing.endpoints = mergeUniqueStrings(existing.endpoints ?? [], endpoints);
		existing.supported_params = mergeUniqueStrings(
			existing.supported_params ?? [],
			supportedParams,
		);
		existing.input_modalities = mergeUniqueStrings(
			parseModalities(existing.input_modalities),
			inputModalities,
		);
		existing.output_modalities = mergeUniqueStrings(
			parseModalities(existing.output_modalities),
			outputModalities,
		);
		existing.is_active_gateway = Boolean(
			existing.is_active_gateway || row.is_active_gateway,
		);
	}

	const results = Array.from(mergedByModelId.values());
	const { data: pricingRulesRaw, error: pricingRulesError } = await supabase
		.from("data_api_pricing_rules")
		.select(
			"model_key, pricing_plan, meter, unit, unit_size, price_per_unit, effective_from, effective_to, priority",
		)
		.like("model_key", `${apiProviderId}:%`);

	if (pricingRulesError) {
		throw pricingRulesError;
	}

	const pricingRules = (pricingRulesRaw ?? []) as PricingRuleRow[];
	const now = new Date();
	const currentPricingRules = pricingRules.filter((rule) =>
		isCurrentPricingRule(rule, now),
	);

	for (const model of results) {
		const apiModelIds = apiModelIdsByModelId.get(model.model_id) ?? new Set<string>();
		if (!apiModelIds.size) continue;

		const matchingRules = currentPricingRules.filter((rule) => {
			if (!rule.model_key) return false;
			for (const apiModelId of apiModelIds) {
				if (rule.model_key.startsWith(`${apiProviderId}:${apiModelId}:`)) {
					return true;
				}
			}
			return false;
		});
		if (!matchingRules.length) continue;

		const standardRules = matchingRules.filter((rule) => {
			const plan = String(rule.pricing_plan ?? "standard").toLowerCase();
			return plan === "standard";
		});
		const effectiveRules = standardRules.length ? standardRules : matchingRules;

		const tokenInputPrices = effectiveRules
			.filter((rule) => {
				const meter = String(rule.meter ?? "").toLowerCase();
				return meter.startsWith("input") && meter.includes("token");
			})
			.map(toPerMillionUsd)
			.filter((value): value is number => value != null && Number.isFinite(value));

		const tokenOutputPrices = effectiveRules
			.filter((rule) => {
				const meter = String(rule.meter ?? "").toLowerCase();
				return meter.startsWith("output") && meter.includes("token");
			})
			.map(toPerMillionUsd)
			.filter((value): value is number => value != null && Number.isFinite(value));

		const sortedRules = [...effectiveRules].sort((a, b) => {
			const aPriority = Number(a.priority ?? 0);
			const bPriority = Number(b.priority ?? 0);
			if (aPriority !== bPriority) return bPriority - aPriority;
			const aFrom = a.effective_from
				? new Date(a.effective_from).getTime()
				: Number.NEGATIVE_INFINITY;
			const bFrom = b.effective_from
				? new Date(b.effective_from).getTime()
				: Number.NEGATIVE_INFINITY;
			return bFrom - aFrom;
		});

		const baselineRule = sortedRules[0] ?? null;
		const baselinePrice = baselineRule
			? Number(baselineRule.price_per_unit ?? NaN)
			: Number.NaN;

		model.input_price_per_1m_usd =
			tokenInputPrices.length > 0 ? Math.min(...tokenInputPrices) : null;
		model.output_price_per_1m_usd =
			tokenOutputPrices.length > 0 ? Math.min(...tokenOutputPrices) : null;
		model.starting_price_usd = Number.isFinite(baselinePrice)
			? baselinePrice
			: null;
		model.starting_price_unit = baselineRule
			? toBasicUnitLabel(baselineRule)
			: null;
	}

	results.sort((a, b) => {
		const aTs = a.created_at
			? new Date(a.created_at).getTime()
			: Number.NEGATIVE_INFINITY;
		const bTs = b.created_at
			? new Date(b.created_at).getTime()
			: Number.NEGATIVE_INFINITY;
		if (aTs === bTs) {
			return (a.model_name ?? a.model_id).localeCompare(
				b.model_name ?? b.model_id,
			);
		}
		return bTs - aTs;
	});

	return results;
}

export async function getAPIProviderModelsListByAddedCached(
	apiProviderId: string,
	includeHidden: boolean,
): Promise<APIProviderModelListItem[]> {
	"use cache";

	cacheLife("days");
	cacheTag("data:api_providers");

	return getAPIProviderModelsListByAdded(apiProviderId, includeHidden);
}
