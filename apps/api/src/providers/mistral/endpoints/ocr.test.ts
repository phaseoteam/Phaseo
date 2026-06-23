import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { jsonResponse, installFetchMock } from "../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { exec } from "./ocr";

const REQUEST_META = {
	requestId: "req_test_mistral_ocr_1",
	apiKeyId: "key_test",
	apiKeyRef: "kid_test",
	apiKeyKid: "kid_test",
};

const OCR4_PRICING_CARD = {
	provider: "mistral",
	model: "mistral/ocr-4",
	endpoint: "ocr",
	effective_from: null,
	effective_to: null,
	currency: "USD",
	version: null,
	rules: [
		{
			pricing_plan: "standard",
			meter: "input_pages",
			unit: "page",
			unit_size: 1000,
			price_per_unit: "4",
			currency: "USD",
			match: [],
			priority: 100,
		},
		{
			pricing_plan: "standard",
			meter: "input_pages",
			unit: "page",
			unit_size: 1000,
			price_per_unit: "5",
			currency: "USD",
			match: [
				{
					path: "ocr_params.annotations",
					op: "eq",
					value: true,
				},
			],
			priority: 110,
		},
	],
} as any;

function buildArgs(body: Record<string, unknown>) {
	return {
		endpoint: "ocr",
		model: "mistral/ocr-4",
		body,
		meta: { ...REQUEST_META },
		workspaceId: "team_test",
		providerId: "mistral",
		byokMeta: [],
		pricingCard: OCR4_PRICING_CARD,
		providerModelSlug: "mistral-ocr-4-0",
		stream: false,
	} as any;
}

beforeAll(() => {
	setupTestRuntime();
});

afterAll(() => {
	teardownTestRuntime();
});

describe("Mistral OCR billing", () => {
	it("prices OCR 4 from upstream usage_info.pages_processed", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url === "https://api.mistral.example/v1/ocr",
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
				response: jsonResponse(
					{
						pages: [
							{ index: 0, markdown: "First page" },
							{ index: 1, markdown: "Second page" },
						],
						model: "mistral-ocr-4-0",
						usage_info: {
							pages_processed: 29,
							doc_size_bytes: null,
						},
					},
					{ headers: { "x-request-id": "upstream_req_ocr_1" } },
				),
			},
		]);

		const result = await exec(
			buildArgs({
				model: "mistral/ocr-4",
				image: "https://example.com/document.png",
			}),
		);

		mock.restore();

		expect(capturedBody).toEqual({
			model: "mistral-ocr-4-0",
			document: {
				type: "image_url",
				image_url: "https://example.com/document.png",
			},
		});
		expect(result.kind).toBe("completed");
		expect(result.normalized?.text).toBe("First page\n\nSecond page");
		expect(result.normalized?.usage).toMatchObject({
			requests: 1,
			input_pages: 29,
			pages_processed: 29,
		});
		expect(result.bill.upstream_id).toBe("upstream_req_ocr_1");
		expect(result.bill.usage?.pricing).toMatchObject({
			total_nanos: 116_000_000,
			total_usd_str: "0.116",
			total_cents: 11,
		});
		expect(result.bill.usage?.pricing.lines[0]).toMatchObject({
			dimension: "input_pages",
			quantity: 29,
			billable_units: 0.029,
			unit_size: 1000,
			line_nanos: 116_000_000,
		});
	});

	it("forwards Mistral annotation options and prices annotated pages", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url === "https://api.mistral.example/v1/ocr",
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
				response: jsonResponse({
					pages: [{ index: 0, markdown: "Invoice" }],
					model: "mistral-ocr-4-0",
					document_annotation: "{\"invoice_number\":\"INV-123\"}",
					usage_info: {
						pages_processed: 29,
						doc_size_bytes: 4096,
					},
				}),
			},
		]);

		const result = await exec(
			buildArgs({
				model: "mistral/ocr-4",
				image: "https://example.com/invoice.png",
				mistral: {
					document_annotation_format: { type: "json_object" },
					document_annotation_prompt: "Extract the invoice number.",
					table_format: "html",
				},
			}),
		);

		mock.restore();

		expect(capturedBody).toMatchObject({
			model: "mistral-ocr-4-0",
			document_annotation_format: { type: "json_object" },
			document_annotation_prompt: "Extract the invoice number.",
			table_format: "html",
		});
		expect(result.normalized?.usage).toMatchObject({
			input_pages: 29,
			doc_size_bytes: 4096,
			ocr_params: { annotations: true },
		});
		expect(result.bill.usage?.pricing).toMatchObject({
			total_nanos: 145_000_000,
			total_usd_str: "0.145",
			total_cents: 14,
		});
		expect(result.bill.usage?.pricing.lines[0]).toMatchObject({
			dimension: "input_pages",
			quantity: 29,
			unit_price_usd: "5.000000000",
			line_nanos: 145_000_000,
		});
	});
});
