import { describe, it, expect } from "vitest";
import Ajv from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { normalizeProviderCatalog, providerCatalogV11JsonSchema, validateProviderCatalogPricingMeters } from "./provider-catalog";

const price = { meter_key: "input_text_tokens", modality: "text", direction: "input", unit: "token", unit_quantity: 1_000_000, price_nanos: 100_000_000, display_label: "Input", display_unit: "1M tokens" };
const document = () => ({ schema_version: "1.1", data: [{ id: "acme/model", capabilities: ["chat.completions"], service_tiers: [
	{ service_tier: "standard", provider_model_slug: "model", pricing: [price] },
	{ service_tier: "fast", provider_model_slug: "model-fast", pricing: [{ ...price, price_nanos: 200_000_000 }] },
] }] });

describe("provider catalog V1.1", () => {
	it("accepts V1 and V1.1 together without changing legacy models", () => {
		const legacy = { data: [{ id: "acme/model", capabilities: ["chat.completions"], pricing: [price] }] };
		expect(normalizeProviderCatalog(legacy).allModels[0].serviceTiers).toBeUndefined();
		expect(normalizeProviderCatalog({ schema_version: "1.0", ...legacy })).toEqual(normalizeProviderCatalog(legacy));
		const parsed = normalizeProviderCatalog(document());
		expect(parsed.valid).toBe(true);
		expect(parsed.allModels[0].serviceTiers?.map((tier) => [tier.serviceTier, tier.providerModelSlug, tier.pricing[0].priceNanos])).toEqual([["standard", "model", 100_000_000], ["fast", "model-fast", 200_000_000]]);
		const ajv = new Ajv({ strict: false }); addFormats(ajv);
		const validate = ajv.compile(providerCatalogV11JsonSchema);
		expect(validate(document())).toBe(true);
		const noStandard = document(); noStandard.data[0].service_tiers.shift();
		expect(validate(noStandard)).toBe(false);
		const duplicate = document(); duplicate.data[0].service_tiers.push({ ...duplicate.data[0].service_tiers[1], provider_model_slug: "another-fast-id" });
		expect(validate(duplicate)).toBe(false);
	});
	it("accepts an empty V1.1 snapshot and rejects unknown versions", () => {
		expect(normalizeProviderCatalog({ schema_version: "1.1", data: [] }).valid).toBe(true);
		expect(normalizeProviderCatalog({ schema_version: "2.0", data: [] }).issues[0].path).toBe("schema_version");
	});
	it("requires Batch API capability and keeps native tier aliases consistent", () => {
		const ajv = new Ajv({ strict: false }); addFormats(ajv);
		const validate = ajv.compile(providerCatalogV11JsonSchema);
		const body = document(); body.data[0].service_tiers[1].service_tier = "batch";
		expect(validate(body)).toBe(false);
		expect(normalizeProviderCatalog(body).valid).toBe(false);
		body.data[0].capabilities.push("batch");
		expect(validate(body)).toBe(true);
		expect(normalizeProviderCatalog(body).valid).toBe(true);
		Object.assign(body.data[0].service_tiers[1], { upstream_service_tier: "priority" });
		expect(validate(body)).toBe(false);
		expect(normalizeProviderCatalog(body).valid).toBe(false);
	});
	it.each(["highspeed", "priority", "default", "made-up"])("rejects provider-specific tier name %s", (name) => {
		const body = document(); body.data[0].service_tiers[1].service_tier = name;
		expect(normalizeProviderCatalog(body).valid).toBe(false);
	});
	it("rejects duplicate tiers, missing standard and negative tier prices", () => {
		const body = document(); body.data[0].service_tiers[1].service_tier = "standard";
		expect(normalizeProviderCatalog(body).valid).toBe(false);
		body.data[0].service_tiers.shift(); body.data[0].service_tiers[0].service_tier = "fast";
		expect(normalizeProviderCatalog(body).valid).toBe(false);
		const badPrice = document(); badPrice.data[0].service_tiers[1].pricing[0].price_nanos = -1;
		expect(normalizeProviderCatalog(badPrice).issues.some((issue) => issue.path.endsWith("service_tiers[1].pricing[0].price_nanos"))).toBe(true);
	});
	it("checks pricing meters in every tier", async () => {
		const body = document(); body.data[0].service_tiers[1].pricing[0].meter_key = "unsupported";
		const client = { from: () => ({ select: () => ({ in: () => ({ neq: async () => ({ data: [{ meter_key: "input_text_tokens" }], error: null }) }) }) }) };
		const parsed = await validateProviderCatalogPricingMeters(client, normalizeProviderCatalog(body));
		expect(parsed.valid).toBe(false);
		expect(parsed.issues[0].path).toBe("data[0].service_tiers[1].pricing[0].meter_key");
	});
});
