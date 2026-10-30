import { fetchAdminModelAuditSource } from "@/lib/fetchers/internal/fetchAdminModelAuditSource";
import { toUsdPerMillion } from "./helpers";

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
		pricingRulesCount: number;
		hasPricing: boolean;
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

function normalizeCapabilityStatus(value: unknown): string {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, "_");
	if (!normalized) return "";
	if (normalized === "not_active") return "inactive";
	if (normalized === "de_ranked" || normalized === "deranked") {
		return "deranked_lvl1";
	}
	if (normalized === "deranked_lvl_1") return "deranked_lvl1";
	if (normalized === "deranked_lvl_2") return "deranked_lvl2";
	if (normalized === "deranked_lvl_3") return "deranked_lvl3";
	return normalized;
}

function isCapabilityGatewayActive(status: unknown): boolean {
	const normalized = normalizeCapabilityStatus(status);
	if (!normalized || normalized === "active") return true;
	if (normalized.startsWith("deranked")) return true;
	return false;
}

export async function getAuditModels(
	includeHidden: boolean
): Promise<AuditModelData[]> {
	const { models, providerRows, benchmarkRows, pricingRows: pricingData } =
		await fetchAdminModelAuditSource(includeHidden);
	if (!models) {
		return [];
	}

	const providerModelsByModelId = new Map<string, any[]>();
	for (const row of providerRows ?? []) {
		const modelKeys = Array.from(
			new Set(
				[
					String((row as any)?.model_id ?? "").trim(),
					String((row as any)?.api_model_id ?? "").trim(),
				].filter(Boolean),
			),
		);
		for (const modelKey of modelKeys) {
			const list = providerModelsByModelId.get(modelKey) ?? [];
			list.push(row);
			providerModelsByModelId.set(modelKey, list);
		}
	}

	const benchmarkCountByModelId = new Map<string, number>();
	for (const row of benchmarkRows ?? []) {
		const modelId = String((row as any)?.model_id ?? "").trim();
		if (!modelId) continue;
		benchmarkCountByModelId.set(
			modelId,
			(benchmarkCountByModelId.get(modelId) ?? 0) + 1,
		);
	}

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
		const pricePerMillion = toUsdPerMillion(p.price_per_unit, p.unit_size);

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

		const providerModels = providerModelsByModelId.get(model.model_id) ?? [];

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
				pricingRuleKeys: Set<string>;
			}
		>();
		const nowIso = new Date().toISOString();

		for (const pm of providerModels) {
			if (!pm?.provider_id) continue;
			const effectiveFrom = String(pm?.effective_from ?? "").trim();
			const effectiveTo = String(pm?.effective_to ?? "").trim();
			const isInWindow =
				(!effectiveFrom || effectiveFrom <= nowIso) &&
				(!effectiveTo || effectiveTo > nowIso);
			const providerModelGatewayEnabled = Boolean(pm.is_active_gateway) && isInWindow;

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
					pricingRuleKeys: new Set<string>(),
				});
			}

			const providerData = providersMap.get(providerId)!;
			const providerModelKey = `${providerId}:${pm.api_model_id}`;

			// Add capabilities
			const capabilities = Array.isArray(pm.capabilities)
				? pm.capabilities
				: pm.capabilities
					? [pm.capabilities]
					: [];
			let hasCapabilityRows = false;
			let hasGatewayActiveCapability = false;

			for (const cap of capabilities) {
				if (cap?.capability_id) {
					hasCapabilityRows = true;
					if (isCapabilityGatewayActive(cap?.status)) {
						hasGatewayActiveCapability = true;
						providerData.capabilities.add(cap.capability_id);
					}
				}
			}

			if (
				providerModelGatewayEnabled &&
				(!hasCapabilityRows || hasGatewayActiveCapability)
			) {
				providerData.isActiveGateway = true;
			}

			const rulesForThisProviderModel = pricingRulesByApiModelKey.get(
				providerModelKey
			);
			if (rulesForThisProviderModel) {
				rulesForThisProviderModel.forEach((rule) =>
					providerData.pricingRuleKeys.add(rule)
				);
			}

			// Check pricing for this provider model
			const modelKey = providerModelKey;
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
			pricingRulesCount: p.pricingRuleKeys.size,
			hasPricing: p.pricingRuleKeys.size > 0,
			// compute if provider supports this model's modalities
			supported:
				(() => {
					const modalities = new Set<string>(
						[...inputTypes, ...outputTypes]
							.map((s) => String(s ?? "").trim().toLowerCase())
							.filter(Boolean),
					);
					if (modalities.size === 0) return true;
					for (const cap of Array.from(p.capabilities)) {
						const capability = String(cap ?? "").trim().toLowerCase();
						if (!capability) continue;
						if (modalities.has(capability)) return true;
						const family = capability.split(".")[0];
						if (family && modalities.has(family)) return true;
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

		const benchmarkCount = benchmarkCountByModelId.get(model.model_id) ?? 0;

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
