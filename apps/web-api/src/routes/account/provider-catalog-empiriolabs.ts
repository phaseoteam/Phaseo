import type { ProviderCatalogModelPreview } from "./provider-catalog";

// These are reviewed serving offers, not a general suffix-based model matcher.
const speedOffers = new Map([
	["moonshotai/kimi-k2.7-code-highspeed", "moonshotai/kimi-k2.7-code"],
	["minimax/minimax-m2.7-highspeed", "minimax/minimax-m2.7"],
	["xiaomi/mimo-v2.6-pro-ultraspeed", "xiaomi/mimo-v2.6-pro"],
]);

export function normalizeEmpirioLabsCatalog(models: ProviderCatalogModelPreview[]): ProviderCatalogModelPreview[] {
	const result = new Map(models.map((model) => [model.id, structuredClone(model)]));
	for (const [speedId, baseId] of speedOffers) {
		const speed = result.get(speedId);
		if (!speed) continue;
		const base = result.get(baseId);
		if (!base || base.serviceTiers?.length || speed.serviceTiers?.length) {
			throw new Error(`EmpirioLabs speed offer ${speedId} requires an unambiguous standard offer.`);
		}
		// V1.1 shares model limits/capabilities between tiers. Do not silently
		// flatten an upstream change which no longer fits that contract.
		for (const field of ["inputModalities", "outputModalities", "contextLength", "maxOutputTokens", "capabilities", "availableFrom", "deprecatedAt", "shutdownAt"] as const) {
			const value = (model: ProviderCatalogModelPreview) => field === "capabilities"
				? model.capabilities.map((capability) => [capability.id, [...capability.parameters].sort()]).sort(([a], [b]) => String(a).localeCompare(String(b)))
				: field === "inputModalities" || field === "outputModalities" ? [...model[field]].sort() : model[field];
			if (JSON.stringify(value(base)) !== JSON.stringify(value(speed))) {
				throw new Error(`EmpirioLabs speed offer ${speedId} differs in ${field}; review before grouping.`);
			}
		}
		base.serviceTiers = [base, speed].map((offer, index) => ({
			serviceTier: index === 0 ? "standard" : "fast",
			providerModelSlug: offer.providerModelSlug,
			upstreamServiceTier: null,
			availability: offer.availability,
			pricing: offer.pricing,
		}));
		result.delete(speedId);
	}
	return [...result.values()];
}
