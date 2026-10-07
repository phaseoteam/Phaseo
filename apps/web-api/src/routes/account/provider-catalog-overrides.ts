import type { ProviderCatalogModelPreview as ProviderCatalogModel } from "./provider-catalog";

export type CatalogOverride = { value: unknown; actor_id: string; actor_kind: "phaseo" | "provider"; edited_at: string };
export type CatalogOverrides = Record<string, Record<string, CatalogOverride>>;
export const catalogEditableFields = ["name", "description", "providerModelSlug", "inputModalities", "outputModalities", "contextLength", "maxOutputTokens", "availability", "availableFrom", "deprecatedAt", "shutdownAt", "capabilities", "pricing", "serviceTiers"] as const;
const equal = (left: unknown, right: unknown) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
const token = (value: string) => value.replace(/~/g, "~0").replace(/\//g, "~1");
const segments = (path: string) => path.split("/").slice(1).map((value) => value.replace(/~1/g, "/").replace(/~0/g, "~"));
type Change = { model_id: string; field: string; value?: unknown; revert?: boolean };

function standardTier(model: ProviderCatalogModel): NonNullable<ProviderCatalogModel["serviceTiers"]>[number] {
	return { serviceTier: "standard" as const, providerModelSlug: model.providerModelSlug, upstreamServiceTier: null, availability: model.availability, pricing: model.pricing };
}

function applyPath(model: ProviderCatalogModel, path: string, value: unknown) {
	const parts = segments(path);
	let parent: any = model;
	for (let index = 0; index < parts.length - 1; index++) {
		const part = parts[index];
		if (part === "serviceTiers" || part === "pricing") {
			if (part === "serviceTiers" && !parent.serviceTiers?.length) {
				if (parts[index + 1] !== "standard" && (index + 1 < parts.length - 1 || value === null)) return;
				parent.serviceTiers = [standardTier(model)];
			}
			const list: any[] = parent[part] ?? [];
			parent[part] = list;
			const key = part === "pricing" ? "meterKey" : "serviceTier";
			const id = parts[++index];
			const itemIndex = list.findIndex((item) => item[key] === id);
			if (index === parts.length - 1) {
				if (value === null) { if (itemIndex >= 0) list.splice(itemIndex, 1); }
				else if (itemIndex >= 0) list[itemIndex] = structuredClone(value);
				else list.push(structuredClone(value));
				return;
			}
			// Field edits do not resurrect a meter or tier removed by the feed.
			if (itemIndex < 0) return;
			parent = list[itemIndex];
		} else {
			if (parent[part] == null) return;
			parent = parent[part];
		}
	}
	if (parts.at(-1) === "$rate") Object.assign(parent, structuredClone(value));
	else parent[parts.at(-1)!] = structuredClone(value);
}

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
		const next = { ...structuredClone(base), id };
		for (const field of catalogEditableFields) if (fields[field]) Object.assign(next, { [field]: fields[field].value });
		// Apply parent additions before child fields, independent of JSONB key order.
		for (const path of Object.keys(fields).filter((field) => field.startsWith("/")).sort((a, b) => segments(a).length - segments(b).length)) applyPath(next, path, fields[path].value);
		const standard = next.serviceTiers?.find((tier) => tier.serviceTier === "standard");
		if (standard) { standard.pricing = next.pricing; standard.availability = next.availability; standard.providerModelSlug = next.providerModelSlug; }
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
	const changes: Change[] = [];
	const prices = (id: string, previous: ProviderCatalogModel["pricing"], next: ProviderCatalogModel["pricing"], prefix: string) => {
		const before = new Map(previous.map((price) => [price.meterKey, price]));
		const after = new Map(next.map((price) => [price.meterKey, price]));
		for (const key of new Set([...before.keys(), ...after.keys()])) {
			const old = before.get(key), current = after.get(key);
			const path = `${prefix}/${token(key)}`;
			if (!old || !current) { if (!equal(old, current)) changes.push({ model_id: id, field: path, value: current ?? null }); continue; }
			const rateChanged = ["unit", "unitQuantity", "priceNanos"].some((field) => !equal(old[field as keyof typeof old], current[field as keyof typeof current]));
			if (rateChanged) changes.push({ model_id: id, field: `${path}/$rate`, value: { priceNanos: current.priceNanos, unitQuantity: current.unitQuantity, unit: current.unit, displayUnit: current.displayUnit } });
			for (const field of ["modality", "direction", "displayLabel", "displayUnit", "conditions"] as const) if ((!rateChanged || field !== "displayUnit") && !equal(old[field], current[field])) changes.push({ model_id: id, field: `${path}/${field}`, value: current[field] });
		}
	};
	for (const model of submitted) {
		const previous = effective.get(model.id);
		if (!previous || !baseIds.has(model.id)) {
			if (!equal(previous, model)) changes.push({ model_id: model.id, field: "$model", value: model });
			if (overrides[model.id]?.$removed) changes.push({ model_id: model.id, field: "$removed", revert: true });
			continue;
		}
		for (const field of catalogEditableFields.filter((field) => field !== "pricing" && field !== "serviceTiers")) if (!equal(previous[field], model[field])) changes.push({ model_id: model.id, field, value: model[field] ?? null });
		prices(model.id, previous.pricing, model.pricing, "/pricing");
		if (previous.serviceTiers?.length || model.serviceTiers?.length) {
			const before = new Map((previous.serviceTiers?.length ? previous.serviceTiers : [standardTier(previous)]).map((tier) => [tier.serviceTier, tier] as const));
			const after = new Map((model.serviceTiers?.length ? model.serviceTiers : [standardTier(model)]).map((tier) => [tier.serviceTier, tier] as const));
			for (const name of new Set([...before.keys(), ...after.keys()])) {
				const old = before.get(name), current = after.get(name);
				const path = `/serviceTiers/${name}`;
				if (!old || !current) { if (!equal(old, current)) changes.push({ model_id: model.id, field: path, value: current ?? null }); continue; }
				if (name === "standard") {
					if (!equal(old.upstreamServiceTier, current.upstreamServiceTier)) changes.push({ model_id: model.id, field: `${path}/upstreamServiceTier`, value: current.upstreamServiceTier });
					continue;
				}
				for (const field of ["providerModelSlug", "upstreamServiceTier", "availability"] as const) if (!equal(old[field], current[field])) changes.push({ model_id: model.id, field: `${path}/${field}`, value: current[field] });
				prices(model.id, old.pricing, current.pricing, `${path}/pricing`);
			}
		}
	}
	for (const id of effective.keys()) if (!submittedIds.has(id)) changes.push({ model_id: id, field: "$removed", value: true });
	return changes;
}
