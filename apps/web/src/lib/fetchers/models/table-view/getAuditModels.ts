import { createAdminClient } from "@/utils/supabase/admin";
import { cacheLife, cacheTag } from "next/cache";

export interface AuditModelData {
	modelId: string;
	modelName: string;
	organisationId: string | null;
	organisationName: string | null;
	releaseDate: string | null;
	retirementDate: string | null;
	status: string | null;
    providers: Array<{
        providerId: string;
        providerName: string;
        minInputPrice: number;
        minOutputPrice: number;
        capabilities: string[];
        isActiveGateway: boolean;
        // Provider support flag for this model
        // true = supported, false = not supported; undefined = unknown (treated as supported by default)
        supported?: boolean;
    }>;
	benchmarkCount: number;
	totalProviders: number;
	activeGatewayProviders: number;
	isActiveOnGateway: boolean;
	pricingRulesCount: number;
	minInputPrice: number;
	minOutputPrice: number;
	avgInputPrice: number;
	avgOutputPrice: number;
	inputTypes: string[];
	outputTypes: string[];
	hidden: boolean;
}

function parseModalitiesArray(value: any): string[] {
	if (!value) return [];
	if (typeof value === "string") {
		try {
			const parsed = JSON.parse(value);
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return value.split(",").map((v: string) => v.trim()).filter(Boolean);
		}
	}
	if (Array.isArray(value)) return value;
	return [];
}

export async function getAuditModels(
	includeHidden: boolean
): Promise<AuditModelData[]> {
	"use cache";

	cacheLife("days");
	cacheTag("audit-models");

	const supabase = createAdminClient();

	// Fetch all models with their relationships
	let query = supabase
		.from("data_models")
		.select(`
			model_id,
			name,
			release_date,
			retirement_date,
			status,
			hidden,
			input_types,
			output_types,
			organisation: data_organisations(
				organisation_id,
				name
			),
			provider_models: data_api_provider_models!data_api_provider_models_internal_model_id_fkey(
				provider_id,
				api_model_id,
				is_active_gateway,
				provider: data_api_providers(
					api_provider_id,
					api_provider_name
				),
				capabilities: data_api_provider_model_capabilities(
					capability_id
				)
			),
			benchmark_results: data_benchmark_results(
				id,
				benchmark_id
			)
		`)
		.order("release_date", { ascending: false });

	if (!includeHidden) {
		query = query.eq("hidden", false);
	}

	const { data: models, error } = await query;

	if (error) {
		throw error;
	}

	if (!models) {
		return [];
	}

	// Fetch pricing data for all models
	const { data: pricingData } = await supabase
		.from("data_api_pricing_rules")
		.select("model_key, meter, price_per_unit, unit_size")
		.or("effective_to.is.null,effective_to.gt." + new Date().toISOString());

	const pricingByKey = new Map<
		string,
		{ inputPrice: number; outputPrice: number }
	>();

	// Count pricing rules per model
	// We need to match pricing rules to models via provider_models table
	// because model_key uses api_model_id, not internal_model_id
	const pricingRulesByApiModelKey = new Map<string, Set<string>>();

	for (const p of pricingData ?? []) {
		if (!p.model_key) continue;

		// Extract provider:api_model_id from model_key
		// Format: provider_id:api_model_id:capability_id
		const keyParts = p.model_key.split(":");
		if (keyParts.length >= 3) {
			// Reconstruct provider:api_model_id (handles slashes in api_model_id)
			const provider = keyParts[0];
			const capability = keyParts[keyParts.length - 1];
			const apiModelId = keyParts.slice(1, -1).join(":");
			const providerModelKey = `${provider}:${apiModelId}`;

			if (!pricingRulesByApiModelKey.has(providerModelKey)) {
				pricingRulesByApiModelKey.set(providerModelKey, new Set());
			}
			pricingRulesByApiModelKey.get(providerModelKey)!.add(p.model_key);
		}

		if (!pricingByKey.has(p.model_key)) {
			pricingByKey.set(p.model_key, {
				inputPrice: 0,
				outputPrice: 0,
			});
		}
		const prices = pricingByKey.get(p.model_key)!;
		const pricePerUnit = Number(p.price_per_unit ?? 0);
		const unitSize = Number(p.unit_size ?? 1);
		const pricePerMillion = pricePerUnit * unitSize * 1000000;

		if (
			(p.meter === "input_text_tokens" || p.meter === "input_tokens") &&
			(prices.inputPrice === 0 || pricePerMillion < prices.inputPrice)
		) {
			prices.inputPrice = pricePerMillion;
		}
		if (
			(p.meter === "output_text_tokens" || p.meter === "output_tokens") &&
			(prices.outputPrice === 0 || pricePerMillion < prices.outputPrice)
		) {
			prices.outputPrice = pricePerMillion;
		}
	}

	// Process and aggregate the data
	const auditModels: AuditModelData[] = models.map((model: any) => {
		const organisation = Array.isArray(model.organisation)
			? model.organisation[0]
			: model.organisation;

		const providerModels = Array.isArray(model.provider_models)
			? model.provider_models
			: model.provider_models
				? [model.provider_models]
				: [];

		// Aggregate providers
		// Precompute modalities for provider compatibility checks
		const inputTypes = parseModalitiesArray(model.input_types);
		const outputTypes = parseModalitiesArray(model.output_types);
		const providersMap = new Map<
			string,
			{
				providerId: string;
				providerName: string;
				minInputPrice: number;
				minOutputPrice: number;
				capabilities: Set<string>;
				isActiveGateway: boolean;
			}
		>();

		for (const pm of providerModels) {
			if (!pm?.provider_id) continue;

			const provider = Array.isArray(pm.provider)
				? pm.provider[0]
				: pm.provider;
			const providerId = pm.provider_id;
			const providerName =
				provider?.api_provider_name || provider?.api_provider_id || providerId;

			if (!providersMap.has(providerId)) {
				providersMap.set(providerId, {
					providerId,
					providerName,
					minInputPrice: Number.POSITIVE_INFINITY,
					minOutputPrice: Number.POSITIVE_INFINITY,
					capabilities: new Set<string>(),
					isActiveGateway: false,
				});
			}

			const providerData = providersMap.get(providerId)!;

			// Track if any provider model is active on gateway
			if (pm.is_active_gateway) {
				providerData.isActiveGateway = true;
			}

			// Add capabilities
			const capabilities = Array.isArray(pm.capabilities)
				? pm.capabilities
				: pm.capabilities
					? [pm.capabilities]
					: [];

			for (const cap of capabilities) {
				if (cap?.capability_id) {
					providerData.capabilities.add(cap.capability_id);
				}
			}

			// Check pricing for this provider model
			const modelKey = `${providerId}:${pm.api_model_id}`;
			const capabilities_arr = Array.from(providerData.capabilities);

			for (const capId of capabilities_arr) {
				const fullKey = `${modelKey}:${capId}`;
				const pricing = pricingByKey.get(fullKey);

				if (pricing) {
					if (
						pricing.inputPrice > 0 &&
						pricing.inputPrice < providerData.minInputPrice
					) {
						providerData.minInputPrice = pricing.inputPrice;
					}
					if (
						pricing.outputPrice > 0 &&
						pricing.outputPrice < providerData.minOutputPrice
					) {
						providerData.minOutputPrice = pricing.outputPrice;
					}
				}
			}
		}

		// Convert to array and clean up infinity values
		const providers = Array.from(providersMap.values()).map((p) => ({
			providerId: p.providerId,
			providerName: p.providerName,
			minInputPrice:
				p.minInputPrice === Number.POSITIVE_INFINITY ? 0 : p.minInputPrice,
			minOutputPrice:
				p.minOutputPrice === Number.POSITIVE_INFINITY ? 0 : p.minOutputPrice,
			capabilities: Array.from(p.capabilities),
			isActiveGateway: p.isActiveGateway,
			// compute if provider supports this model's modalities
			supported:
				(() => {
					const modalities = new Set<string>([...inputTypes, ...outputTypes].filter((s)=>Boolean(s)));
					if (modalities.size === 0) return true;
					for (const cap of Array.from(p.capabilities)) {
						if (modalities.has(cap)) return true;
					}
					return false;
				})(),
		}));

		// Count active gateway providers
		const activeGatewayProviders = providers.filter(
			(p) => p.isActiveGateway
		).length;
		const isActiveOnGateway = activeGatewayProviders > 0;

		const inputPrices = providers
			.map((p) => p.minInputPrice)
			.filter((price) => price > 0);
		const outputPrices = providers
			.map((p) => p.minOutputPrice)
			.filter((price) => price > 0);
		const minInputPrice = inputPrices.length
			? Math.min(...inputPrices)
			: 0;
		const minOutputPrice = outputPrices.length
			? Math.min(...outputPrices)
			: 0;
		const avgInputPrice = inputPrices.length
			? inputPrices.reduce((sum, price) => sum + price, 0) / inputPrices.length
			: 0;
		const avgOutputPrice = outputPrices.length
			? outputPrices.reduce((sum, price) => sum + price, 0) / outputPrices.length
			: 0;

		// Get pricing rules count for this model by checking all provider models
		const allPricingRules = new Set<string>();
		for (const pm of providerModels) {
			if (!pm?.provider_id || !pm?.api_model_id) continue;
			const providerModelKey = `${pm.provider_id}:${pm.api_model_id}`;
			const rulesForThisProviderModel = pricingRulesByApiModelKey.get(
				providerModelKey
			);
			if (rulesForThisProviderModel) {
				rulesForThisProviderModel.forEach((rule) =>
					allPricingRules.add(rule)
				);
			}
		}
		const pricingRulesCount = allPricingRules.size;

		// Count benchmarks
		const benchmarkResults = Array.isArray(model.benchmark_results)
			? model.benchmark_results
			: model.benchmark_results
				? [model.benchmark_results]
				: [];
		const benchmarkCount = benchmarkResults.length;

		// modalities are computed earlier for provider compatibility

		return {
			modelId: model.model_id,
			modelName: model.name || model.model_id,
			organisationId: organisation?.organisation_id || null,
			organisationName: organisation?.name || null,
			releaseDate: model.release_date || null,
			retirementDate: model.retirement_date || null,
			status: model.status || null,
			providers,
			benchmarkCount,
			totalProviders: providers.length,
			activeGatewayProviders,
			isActiveOnGateway,
			pricingRulesCount,
			minInputPrice,
			minOutputPrice,
			avgInputPrice,
			avgOutputPrice,
			inputTypes,
			outputTypes,
			hidden: Boolean(model.hidden),
		};
	});

	return auditModels;
}
