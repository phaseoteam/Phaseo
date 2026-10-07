import type { ProviderCatalogPreview, ProviderCatalogModelPreview } from "./provider-catalog";

export const CATALOG_SERVICE_TIERS = ["standard", "fast", "ultrafast", "flex", "batch"] as const;
export type CatalogServiceTier = typeof CATALOG_SERVICE_TIERS[number];
export type ProviderCatalogTier = {
	serviceTier: CatalogServiceTier;
	providerModelSlug: string;
	upstreamServiceTier: string | null;
	availability: ProviderCatalogModelPreview["availability"];
	pricing: ProviderCatalogModelPreview["pricing"];
};

export function normalizeTieredProviderCatalog(payload: Record<string, unknown>, normalizeV1: (payload: unknown) => ProviderCatalogPreview): ProviderCatalogPreview {
	const issues: ProviderCatalogPreview["issues"] = [];
	const models: ProviderCatalogModelPreview[] = [];
	if (Object.keys(payload).some((key) => !["schema_version", "data"].includes(key))) issues.push({ path: "$", message: "Unknown catalog field." });
	if (!Array.isArray(payload.data) || payload.data.length > 1000) {
		return { valid: false, modelCount: 0, models: [], allModels: [], issues: [{ path: "data", message: "Expected up to 1000 models." }], truncated: false };
	}
	const seen = new Set<string>();
	for (const [index, entry] of payload.data.entries()) {
		if (!entry || typeof entry !== "object" || Array.isArray(entry)) { issues.push({ path: `data[${index}]`, message: "Each model must be an object." }); continue; }
		const { service_tiers, ...base } = entry as Record<string, unknown>;
		if ("pricing" in base || "provider_model_slug" in base) issues.push({ path: `data[${index}]`, message: "V1.1 upstream model IDs and prices belong inside service_tiers." });
		if (!Array.isArray(service_tiers) || !service_tiers.length || service_tiers.length > CATALOG_SERVICE_TIERS.length) {
			issues.push({ path: `data[${index}].service_tiers`, message: "Provide one to five normalized service tiers, including standard." }); continue;
		}
		const tiers: ProviderCatalogTier[] = [];
		const seenTiers = new Set<string>();
		let normalizedModel: ProviderCatalogModelPreview | undefined;
		for (const [tierIndex, raw] of service_tiers.entries()) {
			const path = `data[${index}].service_tiers[${tierIndex}]`;
			if (!raw || typeof raw !== "object" || Array.isArray(raw)) { issues.push({ path, message: "Expected a service tier object." }); continue; }
			const tier = raw as Record<string, unknown>;
			const name = tier.service_tier;
			if (typeof name !== "string" || !CATALOG_SERVICE_TIERS.includes(name as CatalogServiceTier) || seenTiers.has(name)) {
				issues.push({ path: `${path}.service_tier`, message: "Use a unique normalized tier: standard, fast, ultrafast, flex or batch." }); continue;
			}
			seenTiers.add(name);
			if (Object.keys(tier).some((key) => !["service_tier", "provider_model_slug", "upstream_service_tier", "pricing", "availability"].includes(key))) issues.push({ path, message: "Unknown service tier field." });
			if (typeof tier.provider_model_slug !== "string" || !tier.provider_model_slug.trim()) issues.push({ path: `${path}.provider_model_slug`, message: "Provide the upstream model ID for this tier." });
			if (tier.upstream_service_tier != null && (typeof tier.upstream_service_tier !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(tier.upstream_service_tier))) issues.push({ path: `${path}.upstream_service_tier`, message: "Expected a simple upstream service tier value or null." });
			if (tier.upstream_service_tier != null) {
				const native = String(tier.upstream_service_tier);
				const normalized = native === "default" ? "standard" : native === "priority" ? "fast" : native;
				if (normalized !== name) issues.push({ path: `${path}.upstream_service_tier`, message: "The upstream tier must map to this normalized tier. For model-ID based tiers, omit upstream_service_tier." });
			}
			if (!Array.isArray(tier.pricing) || !tier.pricing.length) issues.push({ path: `${path}.pricing`, message: "Provide explicit effective pricing for every service tier." });
			const parsed = normalizeV1({ data: [{ ...base, provider_model_slug: tier.provider_model_slug, pricing: tier.pricing, availability: tier.availability ?? base.availability }] });
			for (const issue of parsed.issues) issues.push({ ...issue, path: issue.path.replace(/^data\[0\]/, path) });
			const model = parsed.allModels[0];
			if (!model || !parsed.valid) continue;
			if (name === "batch" && (!model.capabilities.some((capability) => ["batch", "batch.create"].includes(capability.id)) || tier.upstream_service_tier != null)) {
				issues.push({ path, message: "Batch offers require a batch capability and use the Batch API, without an upstream service tier parameter." });
			}
			if (name === "standard") normalizedModel = model;
			tiers.push({ serviceTier: name as CatalogServiceTier, providerModelSlug: model.providerModelSlug, upstreamServiceTier: tier.upstream_service_tier as string ?? null, availability: model.availability, pricing: model.pricing });
		}
		if (!normalizedModel) { issues.push({ path: `data[${index}].service_tiers`, message: "A valid standard tier is required." }); continue; }
		for (const tier of tiers) {
			if (!["standard", "batch"].includes(tier.serviceTier) && tier.providerModelSlug === normalizedModel.providerModelSlug && tier.upstreamServiceTier === null) {
				const tierIndex = service_tiers.findIndex((raw) => raw && typeof raw === "object" && (raw as Record<string, unknown>).service_tier === tier.serviceTier);
				issues.push({ path: `data[${index}].service_tiers[${tierIndex}].upstream_service_tier`, message: "Select this tier with a distinct upstream model ID or a native service tier parameter." });
			}
		}
		if (seen.has(normalizedModel.id.toLowerCase())) { issues.push({ path: `data[${index}].id`, message: `Duplicate model id: ${normalizedModel.id}.` }); continue; }
		seen.add(normalizedModel.id.toLowerCase());
		models.push({ ...normalizedModel, serviceTiers: tiers });
	}
	return { valid: issues.length === 0, modelCount: payload.data.length, models: models.slice(0, 100), allModels: models, issues: issues.slice(0, 100), truncated: models.length > 100 };
}
