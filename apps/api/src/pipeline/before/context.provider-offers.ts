import type { GatewayContextData } from "./types";
import { splitProviderScopedModel } from "./context.nebius";

function normalizeValue(value: string | null | undefined): string {
	return String(value ?? "").trim().toLowerCase();
}

function filterPricingForProviders(
	pricing: Record<string, any> | undefined,
	allowedProviderIds: Set<string>,
): Record<string, any> {
	return Object.fromEntries(
		Object.entries(pricing ?? {}).filter(([providerId]) => allowedProviderIds.has(providerId)),
	);
}

function normalizeOfferScope(value: unknown): "global" | "regional" | "specialized" | null {
	return value === "global" || value === "regional" || value === "specialized"
		? value
		: null;
}

export function applyExplicitProviderModelRouting(args: {
	parsed: GatewayContextData;
	requestedModel: string;
}): GatewayContextData {
	const providers = Array.isArray(args.parsed.providers) ? args.parsed.providers : [];
	if (!providers.length) return args.parsed;

	const scoped = splitProviderScopedModel(args.requestedModel);
	if (!scoped) return args.parsed;
	const normalizedRequestedModel = normalizeValue(args.requestedModel);
	const normalizedResolvedModel = normalizeValue(args.parsed.resolvedModel);
	if (
		normalizedRequestedModel &&
		normalizedResolvedModel &&
		normalizedRequestedModel === normalizedResolvedModel
	) {
		return args.parsed;
	}

	const requestedSlug = normalizeValue(scoped.providerModelSlug);
	const exactMatches = providers.filter((provider) =>
		normalizeValue(provider.providerId) === scoped.providerId &&
		normalizeValue(provider.providerModelSlug) === requestedSlug,
	);
	if (!exactMatches.length) return args.parsed;

	const expandedMatches = [...exactMatches];
	for (const exactMatch of exactMatches) {
		if (normalizeOfferScope(exactMatch.offerScope) !== "global") continue;
		const familyId = normalizeValue(exactMatch.providerFamilyId);
		const apiModelId = normalizeValue(exactMatch.apiModelId);
		if (!familyId || !apiModelId) continue;

		for (const provider of providers) {
			if (normalizeOfferScope(provider.offerScope) !== "specialized") continue;
			if (normalizeValue(provider.providerFamilyId) !== familyId) continue;
			if (normalizeValue(provider.apiModelId) !== apiModelId) continue;
			if (expandedMatches.includes(provider)) continue;
			expandedMatches.push(provider);
		}
	}

	const filteredPricing = filterPricingForProviders(
		args.parsed.pricing,
		new Set(expandedMatches.map((provider) => provider.providerId)),
	);

	return {
		...args.parsed,
		providers: expandedMatches,
		pricing: filteredPricing,
	};
}
