import { describe, expect, it } from "vitest";
import Ajv from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { normalizeProviderCatalog, providerCatalogV12JsonSchema } from "./provider-catalog";
import { normalizedCatalogDocument } from "./provider-catalog-overrides";
import internalProvider from "./__fixtures__/catalog-data-policy-provider.json";
import { catalogPolicyEvidenceUrlSchema } from "./provider-catalog-data-policy";

const declaration = () => ({ id: "text.generate", training_policy: "no_train", retention_mode: "none", retention_days: 0,
	zero_data_retention: true, zdr_eligibility: "eligible", requirements: { contract_mode: "none", account_settings: [] },
	privacy_policy_url: "https://example.com/privacy", terms_of_service_url: "https://example.com/terms" });
const feed = () => ({ schema_version: "1.2", data: [{ id: "acme/model", capabilities: ["responses"], service_tiers: [{
	service_tier: "standard", provider_model_slug: "model", pricing: [{ meter_key: "input_text_tokens", modality: "text", unit: "token", unit_quantity: 1000000, price_nanos: 1000000, display_label: "Input", display_unit: "1M tokens" }],
	data_policy: { capabilities: [declaration()] },
}] }] });

describe("catalog v1.2 privacy declarations", () => {
	it.each([["embeddings", "text.embed"], ["audio.transcribe", "audio.transcription"], ["chat.generate", "text.generate"]])("preserves canonical policies for %s", (alias, canonical) => {
		for (const id of [alias, canonical]) {
			const body = feed(); body.data[0].capabilities = [alias];
			Object.assign(body.data[0].service_tiers[0].data_policy.capabilities[0], { id, zero_data_retention: false, zdr_eligibility: "ineligible" });
			const parsed = normalizeProviderCatalog(body);
			expect(parsed.issues).toEqual([]);
			expect(parsed.allModels[0].serviceTiers![0].dataPolicy?.capabilities[0].id).toBe(canonical);
		}
	});
	it("rejects duplicate policies expressed through different aliases", () => {
		const body = feed();
		body.data[0].service_tiers[0].data_policy.capabilities.push({ ...declaration(), id: "responses" });
		expect(normalizeProviderCatalog(body).valid).toBe(false);
	});
	it.each(["not-a-url", "", "http://example.com/privacy", "https://user:password@example.com/privacy"])("rejects invalid evidence without throwing: %s", (value) => {
		expect(catalogPolicyEvidenceUrlSchema.safeParse(value).success).toBe(false);
		const body = feed(); body.data[0].service_tiers[0].data_policy.capabilities[0].privacy_policy_url = value;
		expect(normalizeProviderCatalog(body).valid).toBe(false);
	});
	it("validates the internal provider's native, retained, batch and agreement controls", () => {
		const ajv = new Ajv({ strict: false }); addFormats(ajv);
		expect(ajv.compile(providerCatalogV12JsonSchema)(internalProvider)).toBe(true);
		const parsed = normalizeProviderCatalog(internalProvider);
		expect(parsed.issues).toEqual([]);
		expect(parsed.allModels).toHaveLength(3);
		const native = parsed.allModels[0].serviceTiers!;
		expect(native[0].dataPolicy?.capabilities[0].zero_data_retention).toBe(true);
		expect(native[1].dataPolicy?.capabilities[0].zero_data_retention).toBe(false);
		expect(parsed.allModels[1].serviceTiers![0].dataPolicy?.capabilities[0].retention_days).toBe(30);
		expect(parsed.allModels[2].serviceTiers![0].dataPolicy?.capabilities[0].zdr_eligibility).toBe("conditional");
		expect(normalizeProviderCatalog(normalizedCatalogDocument(parsed.allModels))).toEqual(parsed);
	});
	it("publishes the schema and preserves policy through the draft round trip", () => {
		const ajv = new Ajv({ strict: false }); addFormats(ajv);
		expect(ajv.compile(providerCatalogV12JsonSchema)(feed())).toBe(true);
		const parsed = normalizeProviderCatalog(feed());
		expect(parsed.issues).toEqual([]);
		const roundtrip = normalizeProviderCatalog(normalizedCatalogDocument(parsed.allModels));
		expect(roundtrip).toEqual(parsed);
	});
	it.each([false, null, "missing"])("preserves withdrawal %s instead of retaining a Yes", (value) => {
		const body: any = feed();
		if (value === "missing") delete body.data[0].service_tiers[0].data_policy;
		else if (value === null) body.data[0].service_tiers[0].data_policy = null;
		else Object.assign(body.data[0].service_tiers[0].data_policy.capabilities[0], { zero_data_retention: false, zdr_eligibility: "ineligible", retention_mode: "unknown", retention_days: null });
		const parsed = normalizeProviderCatalog(body);
		expect(parsed.valid).toBe(true);
		expect(parsed.allModels[0].catalogVersion).toBe("1.2");
		expect(normalizeProviderCatalog(normalizedCatalogDocument(parsed.allModels))).toEqual(parsed);
	});
	it.each([
		{ verified: true }, { confidence: "confirmed" }, { retention_days: -1 }, { zero_data_retention: "true" },
		{ retention_mode: "fixed", retention_days: null }, { training_policy: "may_train" }, { zdr_eligibility: "conditional" },
	])("rejects invalid or self-approved declarations %j", (patch) => {
		const body: any = feed(); Object.assign(body.data[0].service_tiers[0].data_policy.capabilities[0], patch);
		expect(normalizeProviderCatalog(body).valid).toBe(false);
	});
	it("keeps declarations out of legacy contracts and prevents capability/tier escalation", () => {
		const body: any = feed(); body.schema_version = "1.1";
		expect(normalizeProviderCatalog(body).valid).toBe(false);
		body.schema_version = "1.2"; body.data[0].service_tiers.push({ ...body.data[0].service_tiers[0], service_tier: "batch", provider_model_slug: "model-batch" }); body.data[0].capabilities.push("batch");
		expect(normalizeProviderCatalog(body).valid).toBe(false);
		body.data[0].service_tiers.pop(); body.data[0].service_tiers[0].data_policy.capabilities[0].id = "files.upload";
		expect(normalizeProviderCatalog(body).valid).toBe(false);
	});
});
