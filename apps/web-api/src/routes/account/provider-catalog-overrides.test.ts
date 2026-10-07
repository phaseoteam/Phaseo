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
});
