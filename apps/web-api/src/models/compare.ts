import { composeModelPricing, type PricingSourceRow } from "@/models/pricing";

type Row = Record<string, unknown>;

export type ComparisonSources = {
	models: Row[];
	providerRows: PricingSourceRow[];
	pricingRows: PricingSourceRow[];
	modelPlans: Row[];
	plans: Row[];
};

function text(value: unknown): string {
	return String(value ?? "").trim();
}

function asRow(value: unknown): Row | null {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Row : null;
}

function relation(value: unknown): Row | null {
	return asRow(Array.isArray(value) ? value[0] : value);
}

function rows(value: unknown): Row[] {
	return Array.isArray(value) ? value.map(asRow).filter((row): row is Row => row !== null) : [];
}

function number(value: unknown): number | null {
	if (value === null || value === undefined || value === "") return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function boolean(value: unknown): boolean | null {
	if (value === null || value === undefined || value === "") return null;
	if (typeof value === "boolean") return value;
	if (typeof value === "number") return value !== 0;
	const normalized = text(value).toLowerCase();
	if (["true", "1", "yes"].includes(normalized)) return true;
	if (["false", "0", "no"].includes(normalized)) return false;
	return null;
}

function benchmarkType(value: unknown): "percentage" | "numerical" | null {
	const normalized = text(value).toLowerCase();
	if (["percentage", "percent", "pct", "%"].includes(normalized)) return "percentage";
	if (["numerical", "numeric", "number"].includes(normalized)) return "numerical";
	return null;
}

function benchmarkOrder(value: unknown): "higher" | "lower" {
	return value === false ? "lower" : "higher";
}

function mapBenchmark(value: Row) {
	const benchmark = relation(value.benchmark);
	const benchmarkId = text(benchmark?.id) || text(value.benchmark_id) || text(value.id);
	return {
		benchmark_id: benchmarkId,
		score: value.score ?? null,
		is_self_reported: Boolean(value.is_self_reported),
		source_link: value.source_link ?? null,
		other_info: value.other_info ?? null,
		benchmark: {
			id: benchmarkId,
			name: text(benchmark?.name) || "Unknown Benchmark",
			category: benchmark?.category ?? null,
			order: benchmarkOrder(benchmark?.ascending_order),
			type: benchmarkType(benchmark?.type),
			description: null,
			link: benchmark?.link ?? null,
		},
	};
}

function summarizePricing(groups: ReturnType<typeof composeModelPricing>) {
	return groups.flatMap((group) => group.pricing_rules.flatMap((rule) => {
		const pricePerUnit = number(rule.price_per_unit);
		if (pricePerUnit === null) return [];
		const meter = text(rule.meter).toLowerCase();
		const cached = meter.includes("cached");
		const output = meter.includes("output");
		const note = [`Unit: ${text(rule.unit) || "unit"}`, text(rule.note)].filter(Boolean).join(" | ");
		return [{
			api_provider_id: group.provider.api_provider_id,
			api_provider: {
				api_provider_id: group.provider.api_provider_id,
				api_provider_name: group.provider.api_provider_name,
				link: group.provider.link ?? null,
				description: null,
			},
			input_token_price: !cached && !output ? pricePerUnit : null,
			cached_input_token_price: cached ? pricePerUnit : null,
			output_token_price: output ? pricePerUnit : null,
			throughput: null,
			latency: null,
			source_link: group.provider.link ?? null,
			other_info: note,
			meter: rule.meter ?? null,
			pricing_plan: rule.pricing_plan ?? null,
			unit_size: number(rule.unit_size) ?? 1,
			currency: text(rule.currency) || "USD",
		}];
	}));
}

function plansForModel(modelId: string, modelPlans: Row[], planRows: Row[]) {
	const mappings = modelPlans.filter((mapping) => text(mapping.model_id) === modelId);
	if (mappings.length === 0) return null;
	const mappingByUuid = new Map(mappings.map((mapping) => [text(mapping.plan_uuid), mapping]));
	const grouped = new Map<string, Row & { prices: Row[] }>();
	for (const row of planRows) {
		const planUuid = text(row.plan_uuid);
		const mapping = mappingByUuid.get(planUuid);
		if (!mapping) continue;
		const planId = text(row.plan_id) || planUuid;
		const existing = grouped.get(planId);
		if (existing) {
			existing.prices.push({ price: number(row.price), currency: row.currency ?? null, frequency: row.frequency ?? null });
			continue;
		}
		const organisation = relation(row.organisation);
		grouped.set(planId, {
			plan_id: planId,
			plan_uuid: planUuid,
			name: text(row.name) || planId,
			description: row.description ?? null,
			link: row.link ?? null,
			organisation: {
				organisation_id: text(organisation?.organisation_id) || text(row.organisation_id),
				name: text(organisation?.name) || text(row.organisation_id),
				colour: organisation?.colour ?? null,
			},
			prices: [{ price: number(row.price), currency: row.currency ?? null, frequency: row.frequency ?? null }],
			model_info: {
				model_info: mapping.model_info ?? null,
				rate_limit: mapping.rate_limit ?? null,
				other_info: mapping.other_info ?? null,
			},
		});
	}
	return [...grouped.values()];
}

function providerRowsForModel(modelId: string, providerRows: PricingSourceRow[]) {
	const variants = new Set([modelId, `${modelId}-fast`, `${modelId}-flex`]);
	return providerRows.filter((row) => variants.has(text(row.model_id)) || variants.has(text(row.api_model_id)));
}

function composeModel(model: Row, source: ComparisonSources) {
	const modelId = text(model.model_id);
	const details = rows(model.model_details);
	const detailMap = new Map(details.map((detail) => [text(detail.detail_name), detail.detail_value ?? null]));
	const organisation = relation(model.organisation);
	const providerRows = providerRowsForModel(modelId, source.providerRows);
	const providerPricing = composeModelPricing(providerRows, source.pricingRows);
	const links = new Map<string, unknown>();
	for (const link of rows(model.model_links)) {
		const kind = text(link.kind) || text(link.platform);
		if (kind && !links.has(kind)) links.set(kind, link.url ?? null);
	}
	const detail = (name: string, fallback: unknown = null) => detailMap.get(name) ?? fallback;
	return {
		id: modelId,
		name: text(model.name) || modelId,
		status: model.status ?? null,
		previous_model_id: model.previous_model_id ?? null,
		description: detail("description", model.description) == null ? null : text(detail("description", model.description)),
		announced_date: model.announcement_date ?? null,
		release_date: model.release_date ?? null,
		deprecation_date: model.deprecation_date ?? null,
		retirement_date: model.retirement_date ?? null,
		open_router_model_id: detail("open_router_model_id") == null ? null : text(detail("open_router_model_id")),
		input_context_length: number(detail("input_context_length")),
		output_context_length: number(detail("output_context_length")),
		license: detail("license", model.license) == null ? null : text(detail("license", model.license)),
		multimodal: boolean(detail("multimodal")),
		input_types: model.input_types ?? null,
		output_types: model.output_types ?? null,
		web_access: boolean(detail("web_access")),
		reasoning: boolean(detail("reasoning")),
		fine_tunable: boolean(detail("fine_tunable")),
		knowledge_cutoff: detail("knowledge_cutoff") == null ? null : text(detail("knowledge_cutoff")),
		api_reference_link: links.get("api_reference") ?? links.get("documentation") ?? null,
		paper_link: links.get("paper") ?? null,
		announcement_link: links.get("announcement") ?? null,
		repository_link: links.get("repository") ?? null,
		weights_link: links.get("weights") ?? null,
		parameter_count: number(detail("parameter_count")),
		training_tokens: number(detail("training_tokens")),
		benchmark_results: rows(model.benchmark_results).map(mapBenchmark),
		prices: summarizePricing(providerPricing),
		subscription_plans: plansForModel(modelId, source.modelPlans, source.plans),
		provider: {
			provider_id: text(model.organisation_id),
			name: text(organisation?.name) || text(model.organisation_id),
			website: null,
			country_code: organisation?.country_code ?? null,
			description: null,
			colour: null,
			socials: [],
		},
		model_details: details.map((item) => ({ detail_name: text(item.detail_name), detail_value: item.detail_value ?? null })),
		compare_provider_pricing: providerPricing,
	};
}

export function composeComparisonModels(modelIds: string[], source: ComparisonSources) {
	const byId = new Map(source.models.map((model) => [text(model.model_id), model]));
	return modelIds.flatMap((modelId) => {
		const model = byId.get(modelId);
		return model ? [composeModel(model, source)] : [];
	});
}
