import { describe, expect, it } from "vitest";
import Ajv from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { normalizeProviderCatalog, providerCatalogJsonSchema, providerCatalogV11JsonSchema } from "./provider-catalog";
import { normalizeProviderRateLimits, rateLimitsFromRows } from "./provider-catalog-rate-limits";

const model = (id: string, slug: string) => ({ id, provider_model_slug: slug, capabilities: ["responses"] });
const price = { meter_key: "input_text_tokens", modality: "text", direction: "input", unit: "token", unit_quantity: 1_000_000, price_nanos: 1, display_label: "Input", display_unit: "1M tokens" };

describe("provider-declared rate limits", () => {
	it("normalizes provider-wide and per-model limits declared alongside the catalog", () => {
		const preview = normalizeProviderCatalog({
			data: [model("acme/atlas-1", "atlas-1"), model("acme/atlas-2", "atlas-2")],
			rate_limits: [
				{ requests_per_minute: 600, tokens_per_minute: 1_000_000 },
				{ model: "atlas-2", requests_per_day: 10_000, tokens_per_day: null },
			],
		});
		expect(preview.valid).toBe(true);
		expect(preview.rateLimits).toEqual([
			{ model: null, requests_per_minute: 600, requests_per_day: null, tokens_per_minute: 1_000_000, tokens_per_day: null },
			{ model: "atlas-2", requests_per_minute: null, requests_per_day: 10_000, tokens_per_minute: null, tokens_per_day: null },
		]);
	});

	it("distinguishes an absent declaration from an empty one", () => {
		expect(normalizeProviderCatalog({ data: [model("acme/atlas-1", "atlas-1")] }).rateLimits).toBeNull();
		expect(normalizeProviderCatalog({ data: [model("acme/atlas-1", "atlas-1")], rate_limits: [] })).toMatchObject({ valid: true, rateLimits: [] });
		// An empty catalog can still declare a provider-wide limit, but not one for a model it lacks.
		expect(normalizeProviderCatalog({ data: [], rate_limits: [{ requests_per_minute: 1 }] })).toMatchObject({ valid: true, rateLimits: [{ model: null, requests_per_minute: 1 }] });
		expect(normalizeProviderCatalog({ data: [], rate_limits: [{ model: "atlas-1", requests_per_minute: 1 }] }).valid).toBe(false);
	});

	it("rejects limits for models outside the catalog instead of dropping them", () => {
		const preview = normalizeProviderCatalog({ data: [model("acme/atlas-1", "atlas-1")], rate_limits: [{ model: "acme/atlas-1", requests_per_minute: 5 }] });
		expect(preview.valid).toBe(false);
		expect(preview.rateLimits).toBeNull();
		expect(preview.issues).toContainEqual({ path: "rate_limits[0].model", message: "Unknown upstream model: acme/atlas-1. Use a provider_model_slug from this catalog." });
	});

	it.each([
		[[{ requests_per_minute: 0 }], "rate_limits[0].requests_per_minute"],
		[[{ requests_per_minute: 1.5 }], "rate_limits[0].requests_per_minute"],
		[[{ tokens_per_day: "100" }], "rate_limits[0].tokens_per_day"],
		[[{ requests_per_minute: 1, burst: 2 }], "rate_limits[0]"],
		[[{ model: "atlas-1" }], "rate_limits[0]"],
		[[{ model: "", requests_per_minute: 1 }], "rate_limits[0].model"],
		[[{ requests_per_minute: 1 }, { model: "*", requests_per_day: 1 }], "rate_limits[1]"],
		[[{ model: "atlas-1", requests_per_minute: 1 }, { model: "atlas-1", requests_per_day: 1 }], "rate_limits[1]"],
		[{ requests_per_minute: 1 }, "rate_limits"],
	])("reports invalid declaration %j at %s", (rateLimits, path) => {
		const preview = normalizeProviderCatalog({ data: [model("acme/atlas-1", "atlas-1")], rate_limits: rateLimits });
		expect(preview.valid).toBe(false);
		expect(preview.issues.map((issue) => issue.path)).toContain(path);
	});

	it("lets V1.1 catalogs limit the upstream model of any service tier", () => {
		const tiered = (rateLimits: unknown) => normalizeProviderCatalog({
			schema_version: "1.1",
			data: [{ id: "acme/atlas-1", capabilities: ["responses"], service_tiers: [
				{ service_tier: "standard", provider_model_slug: "atlas-1", pricing: [price] },
				{ service_tier: "fast", provider_model_slug: "atlas-1-fast", pricing: [price] },
			] }],
			rate_limits: rateLimits,
		});
		expect(tiered([{ model: "atlas-1-fast", tokens_per_minute: 50_000 }])).toMatchObject({ valid: true, rateLimits: [{ model: "atlas-1-fast", tokens_per_minute: 50_000 }] });
		expect(tiered([{ model: "atlas-1-flex", tokens_per_minute: 50_000 }]).valid).toBe(false);
		expect(tiered(undefined).rateLimits).toBeNull();
	});

	it("publishes the section in both JSON Schema versions", () => {
		const ajv = new Ajv({ strict: false });
		addFormats(ajv);
		const v1 = ajv.compile(providerCatalogJsonSchema);
		const v11 = ajv.compile(providerCatalogV11JsonSchema);
		const rateLimits = [{ requests_per_minute: 600 }, { model: "atlas-1", tokens_per_day: null, tokens_per_minute: 9 }];
		expect(v1({ data: [model("acme/atlas-1", "atlas-1")], rate_limits: rateLimits }), JSON.stringify(v1.errors)).toBe(true);
		expect(v11({ schema_version: "1.1", data: [{ id: "acme/atlas-1", capabilities: ["responses"], service_tiers: [{ service_tier: "standard", provider_model_slug: "atlas-1", pricing: [price] }] }], rate_limits: rateLimits }), JSON.stringify(v11.errors)).toBe(true);
		for (const invalid of [[{ requests_per_minute: 0 }], [{ requests_per_minute: 1.5 }], [{ requests_per_minute: 1, burst: 2 }], [{}], [{ model: "atlas-1" }], [{ requests_per_minute: null }]]) {
			expect(v1({ data: [], rate_limits: invalid })).toBe(false);
		}
	});

	it("returns stored rows in the contract shape, provider-wide first", () => {
		expect(rateLimitsFromRows([
			{ provider_model_slug: "b", requests_per_minute: "5", requests_per_day: null, tokens_per_minute: null, tokens_per_day: 9 },
			{ provider_model_slug: "*", requests_per_minute: 1, requests_per_day: null, tokens_per_minute: null, tokens_per_day: null },
		])).toEqual([
			{ model: null, requests_per_minute: 1, requests_per_day: null, tokens_per_minute: null, tokens_per_day: null },
			{ model: "b", requests_per_minute: 5, requests_per_day: null, tokens_per_minute: null, tokens_per_day: 9 },
		]);
		expect(normalizeProviderRateLimits([{ model: "kept", requests_per_minute: 1 }], new Set(["kept"])).issues).toEqual([]);
	});
});
