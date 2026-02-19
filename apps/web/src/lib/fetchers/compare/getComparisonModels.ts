import { cacheLife, cacheTag } from "next/cache";
import type { Benchmark, ExtendedModel, Price, Provider } from "@/data/types";
import {
	type ModelPage,
	getModelCached,
} from "../models/getModel";
import {
	type ProviderPricing,
	type PricingRule,
	getModelPricingCached,
} from "../models/getModelPricing";
import {
	type SubscriptionPlan,
	getModelSubscriptionPlansCached,
} from "../models/getModelSubscriptionPlans";
import { loadCompareModelsCached } from "@/lib/fetchers/compare/loadCompareModels";

type ComparisonMap = Record<string, ExtendedModel>;

const BOOLEAN_TRUE = new Set(["true", "1", "yes"]);
const BOOLEAN_FALSE = new Set(["false", "0", "no"]);

const toNumber = (value: unknown): number | null => {
	if (value === null || value === undefined) return null;
	if (typeof value === "number") return Number.isFinite(value) ? value : null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
};

const toBoolean = (value: unknown): boolean | null => {
	if (value === null || value === undefined) return null;
	if (typeof value === "boolean") return value;
	if (typeof value === "number") return value !== 0;
	const normalized = String(value).trim().toLowerCase();
	if (BOOLEAN_TRUE.has(normalized)) return true;
	if (BOOLEAN_FALSE.has(normalized)) return false;
	return null;
};

const buildProvider = (model: ModelPage): Provider => ({
	provider_id: model.organisation_id,
	name: model.organisation?.name ?? model.organisation_id,
	website: null,
	country_code: model.organisation?.country_code ?? null,
	description: null,
	colour: null,
	socials: [],
});

function mapBenchmark(result: ModelPage["benchmark_results"][number]) {
	const benchmarkId =
		result.benchmark?.id !== undefined
			? String(result.benchmark.id)
			: String(result.id);
	const benchmark: Benchmark = {
		id: benchmarkId,
		name: result.benchmark?.name ?? "Unknown Benchmark",
		category: result.benchmark?.category ?? null,
		order: result.benchmark?.ascending_order ? "ascending" : "descending",
		description: null,
		link: result.benchmark?.link ?? null,
	};
	return {
		benchmark_id: benchmarkId,
		score: result.score,
		is_self_reported: result.is_self_reported,
		source_link: result.source_link ?? null,
		other_info: result.other_info ?? null,
		benchmark,
	};
}

const DETAIL_FIELD_MAP: Record<string, keyof ExtendedModel> = {
	description: "description",
	open_router_model_id: "open_router_model_id",
	knowledge_cutoff: "knowledge_cutoff",
};

function applyDetails(
	target: ExtendedModel,
	detailMap: Record<string, string | number | null>
) {
	for (const [key, field] of Object.entries(DETAIL_FIELD_MAP)) {
		if (detailMap[key] !== undefined && detailMap[key] !== null) {
			(target as any)[field] = String(detailMap[key]);
		}
	}

	target.input_context_length = toNumber(detailMap.input_context_length);
	target.output_context_length = toNumber(detailMap.output_context_length);
	target.parameter_count = toNumber(detailMap.parameter_count);
	target.training_tokens = toNumber(detailMap.training_tokens);
	target.multimodal = toBoolean(detailMap.multimodal);
	target.reasoning = toBoolean(detailMap.reasoning);
	target.web_access = toBoolean(detailMap.web_access);
	target.fine_tunable = toBoolean(detailMap.fine_tunable);
	target.license =
		detailMap.license !== undefined && detailMap.license !== null
			? String(detailMap.license)
			: null;
}

const mapLinks = (model: ModelPage, target: ExtendedModel): ExtendedModel => {
	const linkMap: Record<string, keyof ExtendedModel> = {
		api_reference: "api_reference_link",
		documentation: "api_reference_link",
		paper: "paper_link",
		announcement: "announcement_link",
		repository: "repository_link",
		weights: "weights_link",
	};

	for (const link of model.model_links ?? []) {
		const field = linkMap[link.platform as keyof typeof linkMap];
		if (field && !target[field]) {
			(target as any)[field] = link.url;
		}
	}

	return target;
};

const mapSubscriptionPlans = (
	plans?: SubscriptionPlan[]
): ExtendedModel["subscription_plans"] => {
	if (!plans || plans.length === 0) return null;
	return plans.map((plan) => ({
		plan_id: plan.plan_id,
		plan_uuid: plan.plan_uuid,
		name: plan.name,
		description: plan.description ?? null,
		link: plan.link ?? null,
		organisation: plan.organisation
			? {
				organisation_id: plan.organisation.organisation_id,
				name: plan.organisation.name,
				colour: plan.organisation.colour ?? null,
			}
			: {
				organisation_id: plan.organisation_id,
				name: plan.organisation_id,
				colour: null,
			},
		prices: (plan.prices ?? []).map((price) => ({
			price:
				price.price === null || price.price === undefined
					? null
					: Number(price.price),
			currency: price.currency ?? null,
			frequency: price.frequency ?? null,
		})),
		model_info: plan.model_info ?? null,
	}));
};

const INPUT_KEYWORDS = ["input", "prompt"];
const OUTPUT_KEYWORDS = ["output", "completion"];
const TOKEN_KEYWORD = "token";

function pickRule(rules: PricingRule[], keywords: string[]): PricingRule | undefined {
	const normalized = keywords.map((keyword) => keyword.toLowerCase());
	return (
		rules.find((rule) => {
			const meter = rule.meter?.toLowerCase() ?? "";
			return normalized.some((keyword) => meter.includes(keyword));
		}) ??
		rules.find((rule) => {
			const meter = rule.meter?.toLowerCase() ?? "";
			return meter.includes(TOKEN_KEYWORD);
		})
	);
}

function perToken(rule?: PricingRule): number | null {
	if (!rule) return null;
	const unitPrice = Number(rule.price_per_unit);
	if (!Number.isFinite(unitPrice)) return null;
	const unitSize = Number(rule.unit_size ?? 1);
	if (!Number.isFinite(unitSize) || unitSize <= 0) return unitPrice;
	return unitPrice / unitSize;
}

function summariseProviderPricing(groups: ProviderPricing[]): Price[] {
	const results: Price[] = [];
	for (const group of groups) {
		const rules = (group.pricing_rules ?? []).filter((rule) => {
			const plan = (rule.pricing_plan ?? "standard").toLowerCase();
			return plan === "standard";
		});
		if (!rules.length) continue;
		const inputRule = pickRule(rules, INPUT_KEYWORDS);
		const outputRule = pickRule(rules, OUTPUT_KEYWORDS);
		const inputPrice = perToken(inputRule);
		const outputPrice = perToken(outputRule);

		if (inputPrice == null && outputPrice == null) continue;

		results.push({
			api_provider_id: group.provider.api_provider_id,
			api_provider: {
				api_provider_id: group.provider.api_provider_id,
				api_provider_name:
					group.provider.api_provider_name ??
					group.provider.api_provider_id,
				link: group.provider.link ?? null,
				description: null,


			},
			input_token_price: inputPrice,
			cached_input_token_price: inputPrice,
			output_token_price: outputPrice,
			throughput: null,
			latency: null,
			source_link: null,
			other_info: inputRule?.note ?? outputRule?.note ?? null,
			meter: inputRule?.meter ?? outputRule?.meter ?? null,
			pricing_plan:
				inputRule?.pricing_plan ?? outputRule?.pricing_plan ?? null,
			unit_size: inputRule?.unit_size ?? outputRule?.unit_size ?? null,
			currency: inputRule?.currency ?? outputRule?.currency ?? "USD",
		});
	}

	// Synthetic summary entry used by compare UI for "at a glance" pricing.
	// Note: this uses the best observed standard prices across providers; it is not
	// guaranteed to be a single provider that offers both minima simultaneously.
	const inputCandidates = results
		.map((r) => r.input_token_price)
		.filter((v): v is number => v != null && Number.isFinite(v));
	const outputCandidates = results
		.map((r) => r.output_token_price)
		.filter((v): v is number => v != null && Number.isFinite(v));
	const minInput =
		inputCandidates.length > 0 ? Math.min(...inputCandidates) : null;
	const minOutput =
		outputCandidates.length > 0 ? Math.min(...outputCandidates) : null;

	if (minInput != null || minOutput != null) {
		results.unshift({
			input_token_price: minInput,
			cached_input_token_price: minInput,
			output_token_price: minOutput,
			throughput: null,
			latency: null,
			source_link: null,
			other_info: "Best observed standard token prices across providers.",
			meter: "summary",
			pricing_plan: "standard",
			unit_size: 1,
			currency: results.find((r) => r.currency)?.currency ?? "USD",
		});
	}

	return results;
}

function convertModelToExtended(
	model: ModelPage,
	providerPricing: ProviderPricing[],
	subscriptionPlans: SubscriptionPlan[]
): ExtendedModel {
	const detailMap = (model.model_details ?? []).reduce<
		Record<string, string | number | null>
	>((acc, detail) => {
		acc[detail.detail_name] = detail.detail_value ?? null;
		return acc;
	}, {});

	const extended: ExtendedModel = {
		id: model.model_id,
		name: model.name,
		status: (model as any).status ?? null,
		previous_model_id: (model as any).previous_model_id ?? null,
		description: null,
		announced_date: model.announcement_date ?? null,
		release_date: model.release_date ?? null,
		deprecation_date: model.deprecation_date ?? null,
		retirement_date: model.retirement_date ?? null,
		open_router_model_id: null,
		input_context_length: null,
		output_context_length: null,
		license: null,
		multimodal: null,
		input_types: model.input_types ?? null,
		output_types: model.output_types ?? null,
		web_access: null,
		reasoning: null,
		fine_tunable: null,
		knowledge_cutoff: null,
		api_reference_link: null,
		paper_link: null,
		announcement_link: null,
		repository_link: null,
		weights_link: null,
		parameter_count: null,
		training_tokens: null,
		benchmark_results: (model.benchmark_results ?? []).map(mapBenchmark),
		prices: (() => {
			try {
				const summaries = summariseProviderPricing(providerPricing);
				return summaries.length ? summaries : null;
			} catch (error) {
				console.warn("[compare] Failed to summarise pricing", {
					modelId: model.model_id,
					error,
				});
				return null;
			}
		})(),
		subscription_plans: mapSubscriptionPlans(subscriptionPlans),
		provider: buildProvider(model),
		model_details:
			model.model_details?.map((detail) => ({
				detail_name: detail.detail_name,
				detail_value: detail.detail_value ?? null,
			})) ?? null,
	};

	applyDetails(extended, detailMap);
	mapLinks(model, extended);
	console.log("[compare] Converted model", {
		id: extended.id,
		name: extended.name,
		benchmarks: extended.benchmark_results?.length ?? 0,
		details: extended.model_details?.length ?? 0,
		prices: extended.prices?.length ?? 0,
	});

	return extended;
}

async function fetchComparisonModels(
	serializedKey: string,
	includeHidden: boolean
): Promise<ComparisonMap> {
	"use cache";
	cacheLife("days");              // use preset profile
	cacheTag("data:models");        // tag for revalidation

	if (!serializedKey) return {};

	const ids = serializedKey.split(",");
	const results = await Promise.all(
		ids.map(async (id) => {
			try {
				const [model, providerPricing, subscriptionPlans] = await Promise.all([
					getModelCached(id, includeHidden),
					getModelPricingCached(id, includeHidden),
					getModelSubscriptionPlansCached(id, includeHidden).catch((error) => {
						console.warn("[compare] Failed to load subscription plans, continuing without them", {
							modelId: id,
							error,
						});
						return [];
					}),
				]);
				return convertModelToExtended(model, providerPricing, subscriptionPlans);
			} catch (error) {
				console.error("[compare] Failed to load model data", id, error);
				return null;
			}
		})
	);

	const map: ComparisonMap = {};
	ids.forEach((id, index) => {
		const model = results[index];
		if (model) {
			map[id] = model;
		}
	});
	return map;
}

export async function getComparisonModelsCached(
	modelIds: string[],
	includeHidden: boolean
): Promise<ExtendedModel[]> {
	const uniqueOrdered: string[] = [];
	const seen = new Set<string>();

	for (const id of modelIds) {
		const trimmed = id?.trim();
		if (!trimmed) continue;
		if (seen.has(trimmed)) continue;
		seen.add(trimmed);
		uniqueOrdered.push(trimmed);
	}

	if (uniqueOrdered.length === 0) return [];

	console.log("[compare] Resolving comparison models", uniqueOrdered);

	// stable key so different orderings share the same cache entry
	const cacheKey = [...uniqueOrdered].sort().join(",");
	console.log("[compare] Fetching models for cache key", cacheKey);

	// Note: no cacheLife/cacheTag here; fetchComparisonModels is the cached boundary.
	let resultMap = await fetchComparisonModels(cacheKey, includeHidden);

	console.log("[compare] Received detailed models", resultMap);

	const missingIds = uniqueOrdered.filter((id) => !resultMap[id]);
	if (missingIds.length > 0) {
		console.warn(
			"[compare] Missing detailed data for some models, falling back to cached list:",
			missingIds
		);

		const fallbackModels = await loadCompareModelsCached(includeHidden);
		console.log(
			"[compare] Fallback compare models count",
			fallbackModels.length
		);

		const fallbackMap = new Map(
			fallbackModels.map((model) => [model.id, model])
		);

		resultMap = {
			...resultMap,
			...Object.fromEntries(
				missingIds
					.map((id) => {
						const model = fallbackMap.get(id);
						return model ? [id, model] : null;
					})
					.filter(Boolean) as Array<[string, ExtendedModel]>
			),
		};

		const stillMissing = missingIds.filter((id) => !resultMap[id]);
		console.warn("[compare] Post fallback map", resultMap);
		if (stillMissing.length > 0) {
			console.warn(
				"[compare] Still missing models after fallback",
				stillMissing
			);
		}
	}

	return uniqueOrdered.map((id) => resultMap[id]).filter(Boolean);
}
