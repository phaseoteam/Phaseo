import { describe, expect, it } from "vitest";
import Ajv from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { parseCatalogDeclarations } from "./provider-catalog-declarations";
import { normalizeProviderCatalog, providerCatalogV12JsonSchema } from "./provider-catalog";
import { normalizedCatalogDocument, catalogOverrideChanges, applyCatalogOverrides } from "./provider-catalog-overrides";

const price = { meter_key: "input_text_tokens", modality: "text", unit: "token", unit_quantity: 1000000, price_nanos: 1000, display_label: "Input", display_unit: "1M tokens" };
const declarations = () => ({
	hugging_face_id: "lab/model", created_at: "2026-10-16T00:00:00Z", tokenizer: "example", quantization: "fp8",
	input_modalities: [
		{ type: "text", supported_inputs: { max_context_length: { value: 128000, unit: "token" } }, pricing: [
			{ kind: "input", unit: "token", price_nanos: 1000, unit_quantity: 1000000 },
			{ kind: "cached_read", unit: "token", price_nanos: 100, unit_quantity: 1000000, implicit: true, cache_ttl_seconds: 3600 },
			{ kind: "cache_write", unit: "token", price_nanos: 2000, unit_quantity: 1000000 },
		], capacity: [{ kind: "input", unit: "token", per: "minute", value: 100000 }] },
		{ type: "image", supported_inputs: { sources: ["url", "base64"], formats: ["image/png"], detail_levels: ["auto", "original"], roles: ["reference"], references: { value: 4 } } },
		{ type: "video", supported_inputs: { max_duration_seconds: { value: 60, unit: "second" } } },
		{ type: "audio", supported_inputs: { formats: ["audio/wav"], max_content_size_bytes: { value: 1024, unit: "byte" } } },
		{ type: "file", supported_inputs: { sources: ["url"], formats: ["application/pdf"], references: { value: 2 } } },
	],
	output_modalities: ["text", "image", "video", "speech", "transcription", "embeddings", "rerank", "audio"].map(type => ({
		type, streaming: !["embeddings", "rerank"].includes(type), supported_parameters: {
			temperature: { type: "range", min: 0, max: 2, default: 1 }, count: { type: "integer", min: 1, max: 10 },
			tools: { type: "boolean" }, mode: { type: "enum", values: ["a", "b"], default: "a" },
			stop: { type: "array", max_items: 4, items: { type: "unknown" } },
			format: { type: "object", properties: { strict: { type: "boolean" } } },
		}, pricing: [{ kind: "output", unit: "token", price_nanos: 2000, unit_quantity: 1000000,
			schedule: { utc_start: "09:00", utc_end: "18:00", utc_days: ["mon"] },
			overrides: [{ when: { all: [{ path: "context_length", op: "gte", value: 128000 }, { not: { path: "mode", op: "eq", value: "free" } }] }, price_nanos: 3000, unit_quantity: 1000000 }],
		}], capacity: [{ kind: "concurrency", unit: "request", value: 4 }],
	})),
	pricing: [{ kind: "web_search", unit: "search", price_nanos: 1000, unit_quantity: 1000 }],
	capacity: [{ kind: "request", unit: "request", per: "hour", value: 1000 }],
	passthrough_parameters: { seed: { type: "integer", min: 0 } },
	datacenters: [{ country_code: "US", region: "example-east" }], deployment_region: "US", discount_to_user: 0.2, is_free: false,
});
const document = () => ({ schema_version: "1.2", data: [{ id: "lab/model", capabilities: ["text.generate"], declarations: declarations(), service_tiers: [{
	service_tier: "standard", provider_model_slug: "upstream", pricing: [price], declarations: { tokenizer: "offer-tokenizer" },
}] }] });

describe("typed catalog declarations", () => {
	it("covers model, media, parameters, prices, capacity and deployment without activating them", () => {
		const ajv = new Ajv({ strict: false }); addFormats(ajv);
		const validate = ajv.compile(providerCatalogV12JsonSchema);
		expect(validate(document()), JSON.stringify(validate.errors)).toBe(true);
		const parsed = normalizeProviderCatalog(document());
		expect(parsed.issues).toEqual([]);
		expect(parsed.warnings).toHaveLength(2);
		expect(parsed.allModels[0].capabilities).toEqual([{ id: "text.generate", parameters: [] }]);
		expect(parsed.allModels[0].pricing[0].priceNanos).toBe(1000);
		expect(normalizeProviderCatalog(normalizedCatalogDocument(parsed.allModels))).toEqual(parsed);
	});
	it("preserves declaration edits through override application", () => {
		const feed = normalizeProviderCatalog(document()).allModels;
		const submitted = structuredClone(feed); submitted[0].serviceTiers![0].declarations = { tokenizer: "replacement" };
		const changes = catalogOverrideChanges(feed, {}, submitted);
		expect(changes).toContainEqual({ model_id: "lab/model", field: "/serviceTiers/standard/declarations", value: { tokenizer: "replacement" } });
		const overrides = { "lab/model": Object.fromEntries(changes.map(change => [change.field, { value: change.value, actor_id: "test", actor_kind: "provider" as const, edited_at: "2026-10-16T00:00:00Z" }])) };
		expect(applyCatalogOverrides(feed, overrides)[0].serviceTiers![0].declarations).toEqual({ tokenizer: "replacement" });
	});
	it.each([
		{ discount_to_user: 1 }, { quantization: "made-up" }, { unrecognised: true },
		{ datacenters: [{ country_code: "USA" }] }, { passthrough_parameters: { x: { type: "range", min: 2, max: 1 } } },
		{ passthrough_parameters: { x: { type: "enum", values: ["a"], default: "b" } } },
		{ pricing: [{ kind: "input", unit: "token", price_nanos: 10, unit_quantity: 1 }] },
		{ capacity: [{ kind: "concurrency", unit: "request", value: 2, per: "minute" }] },
		{ input_modalities: [{ type: "text" }, { type: "text" }] },
	])("rejects malformed declarations %j", value => expect(parseCatalogDeclarations(value).issues.length).toBeGreaterThan(0));
	it("rejects excessive recursion and keeps legacy feeds strict", () => {
		let item: unknown = { type: "unknown" }; for (let n = 0; n < 30; n++) item = { type: "array", items: item };
		expect(parseCatalogDeclarations({ passthrough_parameters: { x: item } }).issues[0].message).toContain("nesting");
		const legacy = document(); legacy.schema_version = "1.1";
		expect(normalizeProviderCatalog(legacy).valid).toBe(false);
	});
});
