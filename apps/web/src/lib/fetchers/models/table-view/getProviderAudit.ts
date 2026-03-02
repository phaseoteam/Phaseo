import { createAdminClient } from "@/utils/supabase/admin";

type ProviderModelRow = {
	provider_api_model_id: string | null;
	provider_id: string | null;
	api_model_id: string | null;
	provider_model_slug: string | null;
	internal_model_id: string | null;
	is_active_gateway: boolean | null;
	effective_from: string | null;
	effective_to: string | null;
	provider:
		| {
			api_provider_id: string | null;
			api_provider_name: string | null;
		}
		| Array<{
			api_provider_id: string | null;
			api_provider_name: string | null;
		}>
		| null;
	capabilities?:
		| Array<{
			capability_id: string | null;
			status: string | null;
		}>
		| {
			capability_id: string | null;
			status: string | null;
		}
		| null;
};

type PricingRuleRow = {
	model_key: string | null;
	effective_from: string | null;
	effective_to: string | null;
};

export interface ProviderAuditModelRow {
	apiModelId: string;
	internalModelId: string | null;
	providerModelSlug: string | null;
	isGatewayActiveNow: boolean;
	isGatewayEnabled: boolean;
	pricingRulesCount: number;
	totalPricingRulesCount: number;
	hasPricing: boolean;
	gapReason: string | null;
	capabilities: string[];
}

export interface ProviderAuditProvider {
	providerId: string;
	providerName: string;
	totalModels: number;
	activeGatewayModels: number;
	modelsWithPricing: number;
	activeWithoutPricing: number;
	rows: ProviderAuditModelRow[];
}

export interface ProviderAuditSummary {
	totalProviders: number;
	totalModels: number;
	activeGatewayModels: number;
	activeWithoutPricing: number;
}

export interface ProviderAuditAlert {
	providerId: string;
	providerName: string;
	count: number;
	models: string[];
}

export interface ProviderAuditData {
	summary: ProviderAuditSummary;
	providers: ProviderAuditProvider[];
	alerts: ProviderAuditAlert[];
}

function parseModelKey(value: string): {
	providerId: string;
	apiModelId: string;
} | null {
	const first = value.indexOf(":");
	const last = value.lastIndexOf(":");
	if (first <= 0 || last <= first) return null;
	return {
		providerId: value.slice(0, first),
		apiModelId: value.slice(first + 1, last),
	};
}

function toArray<T>(value: T | T[] | null | undefined): T[] {
	if (!value) return [];
	return Array.isArray(value) ? value : [value];
}

function isEffectiveNow(effectiveFrom: string | null, effectiveTo: string | null, nowIso: string): boolean {
	const fromOk = !effectiveFrom || effectiveFrom <= nowIso;
	const toOk = !effectiveTo || effectiveTo > nowIso;
	return fromOk && toOk;
}

function formatShortIsoDate(iso: string | null): string | null {
	if (!iso) return null;
	const timestamp = Date.parse(iso);
	if (!Number.isFinite(timestamp)) return null;
	return new Date(timestamp).toISOString().slice(0, 10);
}

export async function getProviderAudit(): Promise<ProviderAuditData> {
	const supabase = createAdminClient();
	const nowIso = new Date().toISOString();

	const [{ data: providerModels, error: providerModelsError }, { data: pricingRules, error: pricingError }] =
		await Promise.all([
			supabase
				.from("data_api_provider_models")
				.select(
					`
					provider_api_model_id,
					provider_id,
					api_model_id,
					provider_model_slug,
					internal_model_id,
					is_active_gateway,
					effective_from,
					effective_to,
					provider:data_api_providers(
						api_provider_id,
						api_provider_name
					),
					capabilities:data_api_provider_model_capabilities(
						capability_id,
						status
					)
					`
				),
			supabase
				.from("data_api_pricing_rules")
				.select("model_key, effective_from, effective_to"),
		]);

	if (providerModelsError) {
		throw new Error(providerModelsError.message || "Failed to load provider models for audit");
	}
	if (pricingError) {
		throw new Error(pricingError.message || "Failed to load pricing rules for provider audit");
	}

	type PricingKeySummary = {
		hasActive: boolean;
		hasMissingEffectiveFrom: boolean;
		hasFutureWindow: boolean;
		hasExpiredWindow: boolean;
		nextEffectiveFrom: string | null;
	};

	const pricingByProviderModel = new Map<string, Map<string, PricingKeySummary>>();
	for (const row of (pricingRules ?? []) as PricingRuleRow[]) {
		if (!row.model_key) continue;
		const parsed = parseModelKey(row.model_key);
		if (!parsed) continue;
		const key = `${parsed.providerId}:${parsed.apiModelId}`;
		if (!pricingByProviderModel.has(key)) {
			pricingByProviderModel.set(key, new Map<string, PricingKeySummary>());
		}
		const rulesByModelKey = pricingByProviderModel.get(key)!;
		if (!rulesByModelKey.has(row.model_key)) {
			rulesByModelKey.set(row.model_key, {
				hasActive: false,
				hasMissingEffectiveFrom: false,
				hasFutureWindow: false,
				hasExpiredWindow: false,
				nextEffectiveFrom: null,
			});
		}

		const summary = rulesByModelKey.get(row.model_key)!;
		const effectiveFrom = row.effective_from;
		const effectiveTo = row.effective_to;

		if (!effectiveFrom) {
			summary.hasMissingEffectiveFrom = true;
		}
		if (effectiveFrom && effectiveFrom > nowIso) {
			summary.hasFutureWindow = true;
			if (!summary.nextEffectiveFrom || effectiveFrom < summary.nextEffectiveFrom) {
				summary.nextEffectiveFrom = effectiveFrom;
			}
		}
		if (effectiveTo && effectiveTo <= nowIso) {
			summary.hasExpiredWindow = true;
		}

		const isActiveNow = Boolean(effectiveFrom && effectiveFrom <= nowIso && (!effectiveTo || effectiveTo > nowIso));
		if (isActiveNow) {
			summary.hasActive = true;
		}
	}

	type AggregatedProviderModel = {
		providerId: string;
		providerName: string;
		apiModelId: string;
		internalModelId: string | null;
		providerModelSlug: string | null;
		isGatewayEnabled: boolean;
		isGatewayActiveNow: boolean;
		capabilities: Set<string>;
	};

	const byProviderModel = new Map<string, AggregatedProviderModel>();

	for (const raw of (providerModels ?? []) as ProviderModelRow[]) {
		const providerId = raw.provider_id ?? "";
		const apiModelId = raw.api_model_id ?? "";
		if (!providerId || !apiModelId) continue;

		const providerData = toArray(raw.provider)[0];
		const providerName =
			providerData?.api_provider_name?.trim() ||
			providerData?.api_provider_id?.trim() ||
			providerId;

		const key = `${providerId}:${apiModelId}`;
		if (!byProviderModel.has(key)) {
			byProviderModel.set(key, {
				providerId,
				providerName,
				apiModelId,
				internalModelId: raw.internal_model_id ?? null,
				providerModelSlug: raw.provider_model_slug ?? null,
				isGatewayEnabled: false,
				isGatewayActiveNow: false,
				capabilities: new Set<string>(),
			});
		}

		const target = byProviderModel.get(key)!;

		if (!target.internalModelId && raw.internal_model_id) {
			target.internalModelId = raw.internal_model_id;
		}
		if (!target.providerModelSlug && raw.provider_model_slug) {
			target.providerModelSlug = raw.provider_model_slug;
		}

		const isGatewayEnabledRow = Boolean(raw.is_active_gateway);
		const activeNow = isGatewayEnabledRow && isEffectiveNow(raw.effective_from, raw.effective_to, nowIso);
		if (isGatewayEnabledRow) target.isGatewayEnabled = true;
		if (activeNow) target.isGatewayActiveNow = true;

		for (const cap of toArray(raw.capabilities)) {
			if (!cap?.capability_id) continue;
			if (cap.status === "disabled") continue;
			target.capabilities.add(cap.capability_id);
		}
	}

	const groupedByProvider = new Map<string, ProviderAuditProvider>();

	for (const aggregate of byProviderModel.values()) {
		const providerKey = aggregate.providerId;
		if (!groupedByProvider.has(providerKey)) {
			groupedByProvider.set(providerKey, {
				providerId: aggregate.providerId,
				providerName: aggregate.providerName,
				totalModels: 0,
				activeGatewayModels: 0,
				modelsWithPricing: 0,
				activeWithoutPricing: 0,
				rows: [],
			});
		}

		const provider = groupedByProvider.get(providerKey)!;
		const pricingKey = `${aggregate.providerId}:${aggregate.apiModelId}`;
		const pricingSummaryByKey = pricingByProviderModel.get(pricingKey);
		const pricingEntries = pricingSummaryByKey ? Array.from(pricingSummaryByKey.values()) : [];
		const totalPricingRulesCount = pricingSummaryByKey?.size ?? 0;
		const pricingRulesCount = pricingEntries.filter((entry) => entry.hasActive).length;
		const hasPricing = pricingRulesCount > 0;

		let gapReason: string | null = null;
		if (!hasPricing) {
			if (totalPricingRulesCount === 0) {
				gapReason = "No pricing rules found";
			} else {
				const missingFromCount = pricingEntries.filter((entry) => entry.hasMissingEffectiveFrom && !entry.hasActive).length;
				const futureCount = pricingEntries.filter((entry) => entry.hasFutureWindow && !entry.hasActive).length;
				const expiredCount = pricingEntries.filter((entry) => entry.hasExpiredWindow && !entry.hasActive).length;
				const nextStart = pricingEntries
					.map((entry) => entry.nextEffectiveFrom)
					.filter((value): value is string => Boolean(value))
					.sort((a, b) => a.localeCompare(b))[0] ?? null;
				const nextStartDate = formatShortIsoDate(nextStart);

				if (missingFromCount === totalPricingRulesCount) {
					gapReason = "Pricing rules missing effective_from";
				} else if (futureCount === totalPricingRulesCount) {
					gapReason = nextStartDate
						? `Pricing starts on ${nextStartDate}`
						: "Pricing rules are future dated";
				} else if (expiredCount === totalPricingRulesCount) {
					gapReason = "All pricing rules expired";
				} else if (futureCount > 0 && nextStartDate) {
					gapReason = `No active pricing yet (next start ${nextStartDate})`;
				} else if (missingFromCount > 0) {
					gapReason = "Some pricing rules are missing effective_from";
				} else if (expiredCount > 0) {
					gapReason = "No active pricing window (rules expired)";
				} else {
					gapReason = "No active pricing window";
				}
			}
		}

		const row: ProviderAuditModelRow = {
			apiModelId: aggregate.apiModelId,
			internalModelId: aggregate.internalModelId,
			providerModelSlug: aggregate.providerModelSlug,
			isGatewayEnabled: aggregate.isGatewayEnabled,
			isGatewayActiveNow: aggregate.isGatewayActiveNow,
			pricingRulesCount,
			totalPricingRulesCount,
			hasPricing,
			gapReason,
			capabilities: Array.from(aggregate.capabilities).sort((a, b) => a.localeCompare(b)),
		};

		provider.rows.push(row);
		provider.totalModels += 1;
		if (row.isGatewayActiveNow) provider.activeGatewayModels += 1;
		if (row.hasPricing) provider.modelsWithPricing += 1;
		if (row.isGatewayActiveNow && !row.hasPricing) provider.activeWithoutPricing += 1;
	}

	const providers = Array.from(groupedByProvider.values())
		.map((provider) => ({
			...provider,
			rows: [...provider.rows].sort((a, b) => a.apiModelId.localeCompare(b.apiModelId)),
		}))
		.sort((a, b) => a.providerName.localeCompare(b.providerName));

	const summary: ProviderAuditSummary = {
		totalProviders: providers.length,
		totalModels: providers.reduce((sum, provider) => sum + provider.totalModels, 0),
		activeGatewayModels: providers.reduce((sum, provider) => sum + provider.activeGatewayModels, 0),
		activeWithoutPricing: providers.reduce((sum, provider) => sum + provider.activeWithoutPricing, 0),
	};

	const alerts: ProviderAuditAlert[] = providers
		.filter((provider) => provider.activeWithoutPricing > 0)
		.map((provider) => ({
			providerId: provider.providerId,
			providerName: provider.providerName,
			count: provider.activeWithoutPricing,
			models: provider.rows
				.filter((row) => row.isGatewayActiveNow && !row.hasPricing)
				.map((row) => row.apiModelId),
		}))
		.sort((a, b) => b.count - a.count);

	return {
		summary,
		providers,
		alerts,
	};
}
