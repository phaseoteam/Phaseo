import { describe, expect, it } from "vitest";
import {
	fetchAndValidateProviderCatalog,
	normalizeProviderCatalog,
	validateProviderCatalogPricingMeters,
	validateCatalogUrl,
} from "./provider-catalog";
import {
	signProviderCatalogWebhook,
	verifyProviderCatalogWebhookSignature,
} from "./provider-catalog-sync";

describe("provider catalog onboarding", () => {
	it("normalizes a database-shaped catalog into a preview", () => {
		const preview = normalizeProviderCatalog({
			data: [{
				id: "acme/atlas-1",
				name: "Atlas 1",
				provider_model_slug: "atlas-1",
				input_modalities: ["text"], output_modalities: ["text"],
				context_length: 32_000,
				capabilities: [{ id: "text.generate", parameters: ["temperature", "tools"] }],
			}] ,
		});

		expect(preview.valid).toBe(true);
		expect(preview.modelCount).toBe(1);
		expect(preview.models[0]).toMatchObject({
		id: "acme/atlas-1",
		providerModelSlug: "atlas-1",
		inputModalities: ["text"],
		contextLength: 32_000,
		capabilities: [{ id: "text.generate", parameters: ["temperature", "tools"] }],
		});
	});

	it("reports duplicate and malformed model records", () => {
		const preview = normalizeProviderCatalog({
			data: [
				{ id: "acme/atlas-1", capabilities: ["text.generate"] },
				{ id: "acme/atlas-1", capabilities: ["text.generate"] },
				{ id: "not-a-model", capabilities: ["text.generate"] },
			],
		});

		expect(preview.valid).toBe(false);
		expect(preview.issues.map((issue) => issue.message)).toEqual(expect.arrayContaining([
			"Duplicate model id: acme/atlas-1.",
			"Model id must use the publisher/model format.",
		]));
	});

	it("only accepts public HTTPS catalog URLs", () => {
		expect(validateCatalogUrl("http://acme.example/models.json").ok).toBe(false);
		expect(validateCatalogUrl("https://localhost/models.json").ok).toBe(false);
		expect(validateCatalogUrl("https://acme.example/models.json")).toEqual({
		ok: true,
		url: "https://acme.example/models.json",
	});
	});

	it("fetches and hashes a valid JSON catalog", async () => {
		const result = await fetchAndValidateProviderCatalog(
			"https://acme.example/models.json",
			async () => new Response(JSON.stringify({ data: [{ id: "acme/atlas-1", capabilities: ["text.generate"] }] }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
		expect(result.preview.valid).toBe(true);
	});

	it("normalizes provider route lifecycle fields", () => {
		const model = normalizeProviderCatalog({ data: [{ id: "acme/atlas-1", availability: "deprecated", available_from: "2026-01-01T00:00:00Z", deprecated_at: "2026-08-01T00:00:00Z", shutdown_at: "2026-10-01T00:00:00Z", capabilities: ["text.generate"] }] }).models[0];
		expect(model).toMatchObject({ availability: "deprecated", availableFrom: "2026-01-01T00:00:00.000Z", deprecatedAt: "2026-08-01T00:00:00.000Z", shutdownAt: "2026-10-01T00:00:00.000Z" });
	});

	it("preserves a future release timestamp for staged publication", () => {
		const model = normalizeProviderCatalog({ data: [{ id: "acme/atlas-1", available_from: "2026-12-01T14:30:00Z", capabilities: ["text.generate"] }] }).models[0];
		expect(model).toMatchObject({ availability: "ready", availableFrom: "2026-12-01T14:30:00.000Z" });
	});

	it("converts provider-local release times to the canonical UTC instant", () => {
		const model = normalizeProviderCatalog({ data: [{ id: "acme/atlas-1", available_from: "2026-12-01T09:30:00-05:00", capabilities: ["text.generate"] }] }).models[0];
		expect(model.availableFrom).toBe("2026-12-01T14:30:00.000Z");
	});

	it("rejects ambiguous lifecycle timestamps without a timezone", () => {
		const preview = normalizeProviderCatalog({ data: [{ id: "acme/atlas-1", available_from: "2026-12-01T14:30:00", capabilities: ["text.generate"] }] });
		expect(preview.valid).toBe(false);
		expect(preview.issues).toContainEqual({ path: "data[0].available_from", message: "Expected an ISO 8601 timestamp with an explicit timezone (Z or ±HH:MM)." });
	});

	it("normalizes billable pricing meters for staged routes", () => {
		const model = normalizeProviderCatalog({ data: [{ id: "acme/atlas-1", capabilities: ["text.generate"], pricing: [{ meter_key: "input_tokens", modality: "text", direction: "input", unit: "token", unit_quantity: 1_000_000, price_nanos: 250_000_000, display_label: "Input tokens", display_unit: "1M tokens" }] }] }).models[0];
		expect(model.pricing).toEqual([{ meterKey: "input_tokens", modality: "text", direction: "input", unit: "token", unitQuantity: 1_000_000, priceNanos: 250_000_000, displayLabel: "Input tokens", displayUnit: "1M tokens" }]);
	});

	it("rejects duplicate and unregistered pricing meters before submission", async () => {
		const preview = normalizeProviderCatalog({ data: [{
			id: "acme/atlas-1",
			capabilities: ["text.generate"],
			pricing: [
				{ meter_key: "input_tokens", modality: "text", direction: "input", unit: "token", unit_quantity: 1, price_nanos: 1, display_label: "Input", display_unit: "token" },
				{ meter_key: "input_tokens", modality: "text", direction: "input", unit: "token", unit_quantity: 1, price_nanos: 2, display_label: "Input", display_unit: "token" },
				{ meter_key: "invented_meter", modality: "text", direction: "input", unit: "request", unit_quantity: 1, price_nanos: 3, display_label: "Invented", display_unit: "request" },
			],
		}] });
		const client = { from: () => ({ select: () => ({ in: () => ({ neq: async () => ({ data: [{ meter_key: "input_tokens" }], error: null }) }) }) }) };
		const validated = await validateProviderCatalogPricingMeters(client, preview);
		expect(validated.valid).toBe(false);
		expect(validated.issues.map((issue) => issue.message)).toEqual(expect.arrayContaining([
			"Duplicate pricing meter: input_tokens.",
			"Unknown pricing meter: invented_meter.",
		]));
	});

	it("rejects invalid lifecycle data instead of silently making a route ready", () => {
		const preview = normalizeProviderCatalog({ data: [{ id: "acme/atlas-1", availability: "sometimes", deprecated_at: "not-a-date", capabilities: ["text.generate"] }] });
		expect(preview.valid).toBe(false);
		expect(preview.issues.map((issue) => issue.path)).toEqual(expect.arrayContaining(["data[0].availability"]));
	});

	it("uses conditional catalog requests and handles not-modified responses", async () => {
		let headers: Headers | undefined;
		const result = await fetchAndValidateProviderCatalog("https://acme.example/models.json", async (_url, init) => {
			headers = new Headers(init?.headers);
			return new Response(null, { status: 304, headers: { etag: '"catalog-v2"' } });
		}, { etag: '"catalog-v1"', lastModified: "Wed, 27 Aug 2026 12:00:00 GMT" });
		expect(headers?.get("if-none-match")).toBe('"catalog-v1"');
		expect(headers?.get("if-modified-since")).toBe("Wed, 27 Aug 2026 12:00:00 GMT");
		expect(result).toMatchObject({ notModified: true, etag: '"catalog-v2"' });
	});

	it("verifies signed webhook deliveries and rejects replay windows", async () => {
		const secret = "whsec_test_provider_catalog_secret";
		const timestamp = "1700000000";
		const body = JSON.stringify({ event_id: "evt_123", type: "catalog.updated" });
		const signature = await signProviderCatalogWebhook(secret, timestamp, body);

		expect(await verifyProviderCatalogWebhookSignature({ secret, timestamp, signature, body, nowSeconds: 1_700_000_120 })).toBe(true);
		expect(await verifyProviderCatalogWebhookSignature({ secret, timestamp, signature, body: `${body} `, nowSeconds: 1_700_000_120 })).toBe(false);
		expect(await verifyProviderCatalogWebhookSignature({ secret, timestamp, signature, body, nowSeconds: 1_700_000_301 })).toBe(false);
	});
});
