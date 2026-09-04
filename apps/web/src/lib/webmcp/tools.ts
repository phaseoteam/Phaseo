import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import type { PricingMeter, PricingModel } from "@/lib/fetchers/pricing/getPricingModels";
import {
	browserWebMCPDataSource,
	loadGatewayModels,
	loadComparisonModels,
	loadModelEvidence,
	loadProviderCards,
	loadPricingModels,
	loadSearchModels,
	type WebMCPDataSource,
} from "./tool-data";
import type { WebMCPTool } from "./types";

const TEXT_ENDPOINTS = new Set(["responses", "text.generate", "chat.completions", "messages"]);

function requiredString(input: Record<string, unknown>, key: string): string {
	const value = input[key];
	if (typeof value !== "string" || !value.trim()) {
		throw new Error(`${key} must be a non-empty string.`);
	}
	return value.trim();
}

function optionalString(input: Record<string, unknown>, key: string): string | undefined {
	const value = input[key];
	if (value == null || value === "") return undefined;
	if (typeof value !== "string") throw new Error(`${key} must be a string.`);
	return value.trim() || undefined;
}

function optionalNonNegativeNumber(input: Record<string, unknown>, key: string): number {
	const value = input[key];
	if (value == null) return 0;
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		throw new Error(`${key} must be a non-negative number.`);
	}
	return value;
}

function optionalLimit(input: Record<string, unknown>, fallback = 8): number {
	const value = input.limit;
	if (value == null) return fallback;
	if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 20) {
		throw new Error("limit must be an integer between 1 and 20.");
	}
	return value;
}

function optionalStringArray(input: Record<string, unknown>, key: string): string[] {
	const value = input[key];
	if (value == null) return [];
	if (!Array.isArray(value)) throw new Error(`${key} must be an array of strings.`);
	return [...new Set(value.map((entry) => typeof entry === "string" ? entry.trim() : "").filter(Boolean))];
}

function optionalBoolean(input: Record<string, unknown>, key: string): boolean | undefined {
	const value = input[key];
	if (value == null) return undefined;
	if (typeof value !== "boolean") throw new Error(`${key} must be a boolean.`);
	return value;
}

function optionalMaximum(input: Record<string, unknown>, key: string): number | undefined {
	if (input[key] == null) return undefined;
	return optionalNonNegativeNumber(input, key);
}

function normalize(value: string | null | undefined) {
	return value?.trim().toLocaleLowerCase() ?? "";
}

function modelSearchText(model: { id: string; title: string; subtitle: string | null }) {
	return normalize(`${model.id} ${model.title} ${model.subtitle ?? ""}`);
}

function routeSummary(model: GatewaySupportedModel) {
	return {
		modelId: model.modelId,
		name: model.modelName,
		organisation: model.organisationName,
		provider: model.providerName ?? model.providerId,
		capabilities: model.capabilities,
		inputModalities: model.inputModalities ?? [],
		outputModalities: model.outputModalities ?? [],
		inputPricePerMillion: model.inputPricePerMillion ?? null,
		outputPricePerMillion: model.outputPricePerMillion ?? null,
		releaseDate: model.releaseDate,
	};
}

function meterKind(meter: PricingMeter): "input" | "output" | null {
	const key = normalize(`${meter.meter} ${meter.unit}`);
	if (key.includes("input") && (key.includes("token") || key.includes("text"))) return "input";
	if (key.includes("output") && (key.includes("token") || key.includes("text"))) return "output";
	return null;
}

function estimateRouteCost(route: PricingModel, inputTokens: number, outputTokens: number) {
	let total = 0;
	const pricedMeters: Array<Record<string, unknown>> = [];
	for (const meter of route.meters) {
		const kind = meterKind(meter);
		if (!kind) continue;
		const quantity = kind === "input" ? inputTokens : outputTokens;
		const unitSize = Number(meter.unit_size);
		const price = Number(meter.price_per_unit);
		if (!Number.isFinite(unitSize) || unitSize <= 0 || !Number.isFinite(price)) continue;
		const cost = (quantity / unitSize) * price;
		total += cost;
		pricedMeters.push({ meter: meter.meter, quantity, unit: meter.unit, unitSize, pricePerUnit: price, cost });
	}
	return { total, pricedMeters };
}

function comparisonUrl(modelIds: string[]) {
	const params = new URLSearchParams();
	for (const modelId of modelIds) params.append("models", modelId.replace("/", "_"));
	return `/compare?${params.toString()}`;
}

export function createPhaseoWebMCPTools(
	source: WebMCPDataSource = browserWebMCPDataSource,
): WebMCPTool[] {
	return [
		{
			name: "discover_phaseo_capabilities",
			title: "Discover Phaseo capabilities",
			description: "Describe Phaseo's agent-accessible model catalogue, gateway research workflows, public API metadata, and WebMCP tools.",
			inputSchema: { type: "object", properties: {} },
			annotations: { readOnlyHint: true },
			execute() {
				return JSON.stringify({
					product: "Phaseo",
					capabilities: ["AI model discovery", "provider route discovery", "model evidence and benchmarks", "provider-specific pricing", "workload cost estimation", "visual model comparison", "gateway request building"],
					publicResources: {
						models: "/models",
						providers: "/api-providers",
						pricing: "/tools/pricing-calculator",
						apiCatalog: "/.well-known/api-catalog",
						mcpServerCard: "/.well-known/mcp/server-card.json",
					},
				});
			},
		},
		{
			name: "search_phaseo_models",
			title: "Search Phaseo models",
			description: "Search Phaseo's AI model catalogue by model name, organisation, family, or model ID.",
			inputSchema: {
				type: "object",
				properties: {
					query: { type: "string", description: "Natural model search text, such as 'small OpenAI reasoning model'." },
					limit: { type: "integer", minimum: 1, maximum: 20, default: 8 },
				},
				required: ["query"],
			},
			annotations: { readOnlyHint: true, untrustedContentHint: true },
			async execute(input, options) {
				const query = normalize(requiredString(input, "query"));
				const limit = optionalLimit(input);
				const terms = query.split(/\s+/).filter(Boolean);
				const models = await loadSearchModels(source, options?.signal);
				const results = models
					.map((model) => ({ model, score: terms.reduce((score, term) => score + (modelSearchText(model).includes(term) ? 1 : 0), 0) }))
					.filter(({ score }) => score > 0)
					.sort((a, b) => b.score - a.score || a.model.title.localeCompare(b.model.title))
					.slice(0, limit)
					.map(({ model }) => ({ modelId: model.id, name: model.title, organisation: model.subtitle, url: model.href, release: model.releaseGroupLabel }));
				return JSON.stringify({ query, count: results.length, models: results });
			},
		},
		{
			name: "inspect_phaseo_model",
			title: "Inspect a Phaseo model",
			description: "Get decision evidence for one canonical Phaseo model, including lifecycle, modalities, context, availability, benchmark highlights, and observed performance when published.",
			inputSchema: {
				type: "object",
				properties: { modelId: { type: "string", description: "Canonical Phaseo model ID." } },
				required: ["modelId"],
			},
			annotations: { readOnlyHint: true, untrustedContentHint: true },
			async execute(input, options) {
				const modelId = requiredString(input, "modelId");
				const evidence = await loadModelEvidence(source, modelId, options?.signal);
				return JSON.stringify({ modelId, ...evidence });
			},
		},
		{
			name: "find_phaseo_gateway_routes",
			title: "Find Phaseo gateway routes",
			description: "Recommend currently available Phaseo Gateway routes against model, capability, modality, price, region, zero-retention, and prompt-training constraints, with explicit rejection reasons.",
			inputSchema: {
				type: "object",
				properties: {
					query: { type: "string", description: "Optional model, organisation, or provider text." },
					capabilities: { type: "array", items: { type: "string" }, description: "Every required capability, such as tools or reasoning." },
					modalities: { type: "array", items: { type: "string" }, description: "Every required input or output modality." },
					providerIds: { type: "array", items: { type: "string" }, description: "Optional provider allowlist." },
					maxInputPricePerMillion: { type: "number", minimum: 0, description: "Maximum published input-token price per million." },
					maxOutputPricePerMillion: { type: "number", minimum: 0, description: "Maximum published output-token price per million." },
					requireNoPromptTraining: { type: "boolean", description: "Require a provider policy of no training or enterprise no training." },
					requireZeroDataRetention: { type: "boolean", description: "Require the provider to publish zero-data-retention support." },
					executionRegion: { type: "string", description: "Required published execution region, such as EU or US." },
					limit: { type: "integer", minimum: 1, maximum: 20, default: 8 },
				},
			},
			annotations: { readOnlyHint: true },
			async execute(input, options) {
				const query = normalize(optionalString(input, "query"));
				const capabilities = optionalStringArray(input, "capabilities").map(normalize);
				const modalities = optionalStringArray(input, "modalities").map(normalize);
				const providerIds = new Set(optionalStringArray(input, "providerIds").map(normalize));
				const maxInputPrice = optionalMaximum(input, "maxInputPricePerMillion");
				const maxOutputPrice = optionalMaximum(input, "maxOutputPricePerMillion");
				const requireNoTraining = optionalBoolean(input, "requireNoPromptTraining") === true;
				const requireZdr = optionalBoolean(input, "requireZeroDataRetention") === true;
				const executionRegion = normalize(optionalString(input, "executionRegion"));
				const limit = optionalLimit(input);
				const [models, providers] = await Promise.all([
					loadGatewayModels(source, options?.signal),
					loadProviderCards(source, options?.signal).catch(() => []),
				]);
				const providersById = new Map(providers.map((provider) => [normalize(provider.api_provider_id), provider]));
				const evaluated = models.map((model) => {
					const reasons: string[] = [];
					const provider = providersById.get(normalize(model.providerId));
					const haystack = normalize(`${model.modelId} ${model.modelName} ${model.organisationName} ${model.providerId} ${model.providerName}`);
					if (query && !haystack.includes(query)) reasons.push(`Does not match query “${query}”`);
					if (providerIds.size && !providerIds.has(normalize(model.providerId))) reasons.push("Provider is outside the allowlist");
					for (const capability of capabilities) if (!model.capabilities.some((value) => normalize(value).includes(capability))) reasons.push(`Missing capability: ${capability}`);
					const routeModalities = [...(model.inputModalities ?? []), ...(model.outputModalities ?? [])].map(normalize);
					for (const modality of modalities) if (!routeModalities.includes(modality)) reasons.push(`Missing modality: ${modality}`);
					if (maxInputPrice != null && (model.inputPricePerMillion == null || model.inputPricePerMillion > maxInputPrice)) reasons.push(model.inputPricePerMillion == null ? "No published input-token price" : `Input price exceeds ${maxInputPrice}/1M`);
					if (maxOutputPrice != null && (model.outputPricePerMillion == null || model.outputPricePerMillion > maxOutputPrice)) reasons.push(model.outputPricePerMillion == null ? "No published output-token price" : `Output price exceeds ${maxOutputPrice}/1M`);
					if (requireNoTraining && !["no_train", "enterprise_no_train"].includes(normalize(model.providerPromptTrainingPolicy))) reasons.push("Provider does not publish an unconditional no-training policy");
					if (requireZdr && provider?.zero_data_retention !== true) reasons.push("Provider does not publish zero data retention");
					if (executionRegion && !(provider?.default_execution_regions ?? []).some((region) => normalize(region) === executionRegion)) reasons.push(`Execution region ${executionRegion.toUpperCase()} is not published`);
					return { model, reasons };
				});
				const routes = evaluated.filter(({ reasons }) => reasons.length === 0).slice(0, limit).map(({ model }) => ({ ...routeSummary(model), policy: { promptTraining: model.providerPromptTrainingPolicy, zeroDataRetention: providersById.get(normalize(model.providerId))?.zero_data_retention ?? null, executionRegions: providersById.get(normalize(model.providerId))?.default_execution_regions ?? [] } }));
				const rejected = evaluated.filter(({ reasons }) => reasons.length > 0).slice(0, 20).map(({ model, reasons }) => ({ modelId: model.modelId, provider: model.providerName ?? model.providerId, reasons }));
				return JSON.stringify({ count: routes.length, routes, rejectedCount: evaluated.length - routes.length, rejected });
			},
		},
		{
			name: "compare_phaseo_model_evidence",
			title: "Compare Phaseo model evidence",
			description: "Compare two to five Phaseo models using catalogue facts, context limits, capabilities, lifecycle, and published benchmark results without leaving the current page.",
			inputSchema: {
				type: "object",
				properties: { modelIds: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 5 } },
				required: ["modelIds"],
			},
			annotations: { readOnlyHint: true, untrustedContentHint: true },
			async execute(input, options) {
				if (!Array.isArray(input.modelIds)) throw new Error("modelIds must be an array of two to five model IDs.");
				const modelIds = [...new Set(input.modelIds.map((value) => typeof value === "string" ? value.trim() : "").filter(Boolean))];
				if (modelIds.length < 2 || modelIds.length > 5) throw new Error("modelIds must contain two to five unique model IDs.");
				const requested = new Set(modelIds);
				const models = (await loadComparisonModels(source, options?.signal))
					.filter((model) => requested.has(model.id))
					.map((model) => ({
						modelId: model.id,
						name: model.name,
						organisation: model.provider?.name ?? null,
						status: model.status,
						description: model.description,
						releaseDate: model.release_date,
						inputContextLength: model.input_context_length,
						outputContextLength: model.output_context_length,
						inputTypes: model.input_types,
						outputTypes: model.output_types,
						reasoning: model.reasoning,
						webAccess: model.web_access,
						license: model.license,
						benchmarks: (model.benchmark_results ?? []).slice(0, 12),
					}));
				return JSON.stringify({ requestedModelIds: modelIds, found: models.length, models });
			},
		},
		{
			name: "estimate_phaseo_text_cost",
			title: "Estimate Phaseo text cost",
			description: "Estimate text input and output token cost across published Phaseo provider routes for one model.",
			inputSchema: {
				type: "object",
				properties: {
					modelId: { type: "string", description: "Canonical Phaseo model ID, for example openai/gpt-5." },
					inputTokens: { type: "number", minimum: 0, default: 0 },
					outputTokens: { type: "number", minimum: 0, default: 0 },
				},
				required: ["modelId"],
			},
			annotations: { readOnlyHint: true },
			async execute(input, options) {
				const modelId = requiredString(input, "modelId");
				const inputTokens = optionalNonNegativeNumber(input, "inputTokens");
				const outputTokens = optionalNonNegativeNumber(input, "outputTokens");
				const routes = (await loadPricingModels(source, modelId, options?.signal))
					.filter((route) => TEXT_ENDPOINTS.has(route.endpoint))
					.map((route) => ({ route, estimate: estimateRouteCost(route, inputTokens, outputTokens) }))
					.filter(({ estimate }) => estimate.pricedMeters.length > 0)
					.sort((a, b) => a.estimate.total - b.estimate.total)
					.map(({ route, estimate }) => ({ provider: route.provider, endpoint: route.endpoint, pricingPlan: route.pricing_plan ?? "standard", currency: route.meters[0]?.currency ?? "USD", estimatedCost: estimate.total, meters: estimate.pricedMeters }));
				return JSON.stringify({ modelId, inputTokens, outputTokens, routeCount: routes.length, routes });
			},
		},
		{
			name: "open_phaseo_model_comparison",
			title: "Open a Phaseo model comparison",
			description: "Open Phaseo's visual comparison for two to five canonical model IDs so the person and agent can inspect them together.",
			inputSchema: {
				type: "object",
				properties: { modelIds: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 5 } },
				required: ["modelIds"],
			},
			annotations: { readOnlyHint: false },
			execute(input) {
				if (!Array.isArray(input.modelIds)) throw new Error("modelIds must be an array of two to five model IDs.");
				const modelIds = [...new Set(input.modelIds.map((value) => typeof value === "string" ? value.trim() : "").filter(Boolean))];
				if (modelIds.length < 2 || modelIds.length > 5) throw new Error("modelIds must contain two to five unique model IDs.");
				const href = comparisonUrl(modelIds);
				source.navigate(href);
				return `Opened the Phaseo comparison for ${modelIds.join(", ")}.`;
			},
		},
		{
			name: "open_phaseo_request_builder",
			title: "Open the Phaseo request builder",
			description: "Open Phaseo's request builder with a selected gateway model so the person can review and finish the API request.",
			inputSchema: {
				type: "object",
				properties: { modelId: { type: "string", description: "A Phaseo Gateway model ID." } },
				required: ["modelId"],
			},
			annotations: { readOnlyHint: false },
			execute(input) {
				const modelId = requiredString(input, "modelId");
				const href = `/tools/request-builder?model=${encodeURIComponent(modelId)}`;
				source.navigate(href);
				return `Opened the Phaseo request builder with ${modelId}.`;
			},
		},
	];
}
