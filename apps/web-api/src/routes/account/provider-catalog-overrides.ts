import type { ProviderCatalogModelPreview as ProviderCatalogModel } from "./provider-catalog";

export type CatalogOverride = { value: unknown; actor_id: string; actor_kind: "phaseo" | "provider"; edited_at: string };
export type CatalogOverrides = Record<string, Record<string, CatalogOverride>>;
export const catalogEditableFields = ["name", "description", "providerModelSlug", "inputModalities", "outputModalities", "contextLength", "maxOutputTokens", "availability", "availableFrom", "deprecatedAt", "shutdownAt", "capabilities", "pricing", "serviceTiers"] as const;
const equal = (left: unknown, right: unknown) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

export function normalizedCatalogDocument(models: ProviderCatalogModel[]) {
	const price = (item: ProviderCatalogModel["pricing"][number]) => ({ meter_key: item.meterKey, modality: item.modality, direction: item.direction, unit: item.unit, unit_quantity: item.unitQuantity, price_nanos: item.priceNanos, display_label: item.displayLabel, display_unit: item.displayUnit, conditions: item.conditions });
	const tiered = models.some((model) => model.serviceTiers?.length);
	return { ...(tiered ? { schema_version: "1.1" } : {}), data: models.map((model) => ({
		id: model.id, name: model.name, description: model.description, capabilities: model.capabilities,
		input_modalities: model.inputModalities, output_modalities: model.outputModalities,
		context_length: model.contextLength, max_output_tokens: model.maxOutputTokens,
		availability: model.availability, available_from: model.availableFrom, deprecated_at: model.deprecatedAt, shutdown_at: model.shutdownAt,
		...(tiered ? { service_tiers: (model.serviceTiers?.length ? model.serviceTiers : [{ serviceTier: "standard", providerModelSlug: model.providerModelSlug, upstreamServiceTier: null, availability: model.availability, pricing: model.pricing }]).map((tier) => ({ service_tier: tier.serviceTier, provider_model_slug: tier.providerModelSlug, upstream_service_tier: tier.upstreamServiceTier, availability: tier.availability, pricing: tier.pricing.map(price) })) } : { provider_model_slug: model.providerModelSlug, pricing: model.pricing.map(price) }),
	})) };
}

export function applyCatalogOverrides(feed: ProviderCatalogModel[], overrides: CatalogOverrides): ProviderCatalogModel[] {
	const models = new Map(feed.map((model) => [model.id, model]));
	for (const [id, fields] of Object.entries(overrides)) {
		if (fields.$removed?.value === true) { models.delete(id); continue; }
		const base = (fields.$model?.value ?? models.get(id)) as ProviderCatalogModel | undefined;
		if (!base) continue;
		const next = { ...base, id };
		for (const field of catalogEditableFields) if (fields[field]) Object.assign(next, { [field]: fields[field].value });
		models.set(id, next);
	}
	return [...models.values()];
}

// Compare against the effective draft, so untouched fields keep their existing
// overrides and new imports cannot accidentally pin every field.
export function catalogOverrideChanges(feed: ProviderCatalogModel[], overrides: CatalogOverrides, submitted: ProviderCatalogModel[]) {
	const effective = new Map(applyCatalogOverrides(feed, overrides).map((model) => [model.id, model]));
	const baseIds = new Set(feed.map((model) => model.id));
	const submittedIds = new Set(submitted.map((model) => model.id));
	const changes: Array<{ model_id: string; field: string; value?: unknown; revert?: boolean }> = [];
	for (const model of submitted) {
		const previous = effective.get(model.id);
		if (!previous || !baseIds.has(model.id)) {
			if (!equal(previous, model)) changes.push({ model_id: model.id, field: "$model", value: model });
			if (overrides[model.id]?.$removed) changes.push({ model_id: model.id, field: "$removed", revert: true });
			continue;
		}
		for (const field of catalogEditableFields) if (!equal(previous[field], model[field])) changes.push({ model_id: model.id, field, value: model[field] ?? null });
	}
	for (const id of effective.keys()) if (!submittedIds.has(id)) changes.push({ model_id: id, field: "$removed", value: true });
	return changes;
}
