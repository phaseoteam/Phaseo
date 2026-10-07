import { describe, expect, it } from "vitest";
import { normalizeProviderCatalog } from "./provider-catalog";
import { applyCatalogOverrides, catalogOverrideChanges, normalizedCatalogDocument, type CatalogOverrides } from "./provider-catalog-overrides";
const models = () => normalizeProviderCatalog({ data: [{ id: "acme/model", name: "Feed name", provider_model_slug: "native", availability: "not_ready", capabilities: ["responses"] }] }).allModels;
const edit = (value: unknown) => ({ value, actor_id: "operator", actor_kind: "phaseo" as const, edited_at: "2026-10-07T00:00:00Z" });

describe("combined provider catalog", () => {
	it("preserves edits while untouched fields follow new feed values", () => {
		const feed = models(); const overrides = { "acme/model": { name: edit("Corrected name") } };
		feed[0].name = "New feed name"; feed[0].description = "New description";
		expect(applyCatalogOverrides(feed, overrides)[0]).toMatchObject({ name: "Corrected name", description: "New description" });
		expect(applyCatalogOverrides(feed, {})[0].name).toBe("New feed name");
	});
	it("only pins changed fields and preserves existing overrides", () => {
		const feed = models(); const overrides = { "acme/model": { name: edit("Corrected name") } };
		const draft = applyCatalogOverrides(feed, overrides); draft[0].description = "Manual description";
		expect(catalogOverrideChanges(feed, overrides, draft)).toEqual([{ model_id: "acme/model", field: "description", value: "Manual description" }]);
		expect(catalogOverrideChanges(feed, overrides, applyCatalogOverrides(feed, overrides))).toEqual([]);
	});
	it("does not resurrect removed feed offers just because fields were edited", () => {
		expect(applyCatalogOverrides([], { "acme/model": { name: edit("Corrected") } })).toEqual([]);
	});
	it("keeps explicitly added models and supports removing and reverting offers", () => {
		const feed = models(); const overrides: CatalogOverrides = { "acme/local": { $model: edit({ ...feed[0], id: "acme/local" }) }, "acme/model": { $removed: edit(true) } };
		expect(applyCatalogOverrides(feed, overrides).map((model) => model.id)).toEqual(["acme/local"]);
		delete overrides["acme/model"].$removed;
		expect(applyCatalogOverrides(feed, overrides).map((model) => model.id)).toEqual(["acme/model", "acme/local"]);
	});
	it("round-trips V1 and V1.1 through normal validation", () => {
		const feed = models();
		expect(normalizeProviderCatalog(normalizedCatalogDocument(feed)).allModels).toEqual(feed);
		feed[0].serviceTiers = [{ serviceTier: "standard", providerModelSlug: "native", upstreamServiceTier: null, availability: "not_ready", pricing: [{ meterKey: "input_text_tokens", modality: "text", direction: "input", unit: "token", unitQuantity: 1000000, priceNanos: 0, displayLabel: "Input", displayUnit: "1M tokens", conditions: [] }] }];
		expect(normalizeProviderCatalog(normalizedCatalogDocument(feed)).valid).toBe(true);
	});
	it("pins one rate and its billing basis while other meters continue updating", () => {
		const feed = models();
		const price = { meterKey: "input_text_tokens", modality: "text", direction: "input", unit: "token", unitQuantity: 1000000, priceNanos: 100000000, displayLabel: "Input", displayUnit: "1M tokens", conditions: [] };
		feed[0].pricing = [price, { ...price, meterKey: "output_text_tokens", direction: "output", priceNanos: 200000000 }];
		const draft = structuredClone(feed); draft[0].pricing[0].priceNanos = 50000000;
		const changes = catalogOverrideChanges(feed, {}, draft);
		expect(changes).toEqual([{ model_id: "acme/model", field: "/pricing/input_text_tokens/$rate", value: { priceNanos: 50000000, unitQuantity: 1000000, unit: "token", displayUnit: "1M tokens" } }]);
		const overrides = { "acme/model": Object.fromEntries(changes.map((change) => [change.field, edit(change.value)])) };
		feed[0].pricing[0] = { ...price, unitQuantity: 1000, priceNanos: 1000000, displayUnit: "1K tokens" };
		feed[0].pricing[1].priceNanos = 300000000;
		const effective = applyCatalogOverrides(feed, overrides)[0];
		expect(effective.pricing[0]).toMatchObject({ priceNanos: 50000000, unitQuantity: 1000000, displayUnit: "1M tokens" });
		expect(effective.pricing[1].priceNanos).toBe(300000000);
		expect(feed[0].pricing[0].unitQuantity).toBe(1000);
	});
	it("does not freeze other tiers when one tier availability is edited", () => {
		const feed = models();
		feed[0].serviceTiers = [{ serviceTier: "standard", providerModelSlug: "native", upstreamServiceTier: null, availability: "not_ready", pricing: [] }, { serviceTier: "fast", providerModelSlug: "native-fast", upstreamServiceTier: null, availability: "ready", pricing: [] }];
		const draft = structuredClone(feed); draft[0].serviceTiers![1].availability = "not_ready";
		const changes = catalogOverrideChanges(feed, {}, draft);
		expect(changes).toEqual([{ model_id: "acme/model", field: "/serviceTiers/fast/availability", value: "not_ready" }]);
		feed[0].providerModelSlug = "new-standard-native";
		const effective = applyCatalogOverrides(feed, { "acme/model": { [changes[0].field]: edit(changes[0].value) } })[0];
		expect(effective.serviceTiers![0].providerModelSlug).toBe("new-standard-native");
		expect(effective.serviceTiers![1].availability).toBe("not_ready");
	});
	it("does not create a tier document for dormant tier field edits on a V1 feed", () => {
		expect(applyCatalogOverrides(models(), { "acme/model": { "/serviceTiers/fast/availability": edit("not_ready") } })[0].serviceTiers).toBeUndefined();
	});
});
