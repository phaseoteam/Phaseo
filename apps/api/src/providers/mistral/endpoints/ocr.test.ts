import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OcrSchema } from "@core/schemas";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { exec } from "./ocr";

beforeAll(() => setupTestRuntime());
afterAll(() => teardownTestRuntime());

const OCR_4_PRICING_CARD = {
	provider: "mistral",
	model: "mistral/ocr-4",
	endpoint: "ocr",
	effective_from: null,
	effective_to: null,
	currency: "USD",
	version: null,
	rules: [
		{ meter: "input_pages", unit: "page", unit_size: 1000, price_per_unit: 4, currency: "USD", pricing_plan: "standard", match: [], priority: 100, effective_from: null, effective_to: null },
		{ meter: "ocr_annotation_pages", unit: "page", unit_size: 1000, price_per_unit: 1, currency: "USD", pricing_plan: "standard", match: [], priority: 110, effective_from: null, effective_to: null },
	],
} as any;

const OCR_3_PRICING_CARD = {
	provider: "mistral",
	model: "mistral/ocr-3",
	endpoint: "ocr",
	effective_from: null,
	effective_to: null,
	currency: "USD",
	version: null,
	rules: [
		{ meter: "input_pages", unit: "page", unit_size: 1000, price_per_unit: 2, currency: "USD", pricing_plan: "standard", match: [], priority: 100, effective_from: null, effective_to: null },
		{ meter: "input_pages", unit: "page", unit_size: 1000, price_per_unit: 3, currency: "USD", pricing_plan: "standard", match: [{ path: "ocr_params.annotations", op: "eq", or_group: 1, and_index: 1, value: true }], priority: 110, effective_from: null, effective_to: null },
	],
} as any;

function buildArgs(body: Record<string, unknown>, providerId = "mistral", pricingCard: any = null) {
	return {
		endpoint: "ocr",
		model: "mistral/ocr-4",
		body,
		meta: {},
		workspaceId: "team_test",
		providerId,
		providerModelSlug: "mistral-ocr-4-0",
		byokMeta: [],
		pricingCard,
		stream: false,
	} as any;
}

describe("Mistral OCR endpoint", () => {
	it("forwards the current document, extraction, confidence, and annotation contract", async () => {
		let capturedBody: Record<string, any> | undefined;
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1/ocr"),
			onRequest: (call) => { capturedBody = call.bodyJson; },
			response: jsonResponse({
				pages: [{
					index: 0,
					markdown: "# Invoice",
					images: [],
					dimensions: { dpi: 200, height: 1200, width: 900 },
					blocks: [{ type: "title", content: "Invoice", top_left_x: 1, top_left_y: 2, bottom_right_x: 3, bottom_right_y: 4 }],
					confidence_scores: { average_page_confidence_score: 0.99, minimum_page_confidence_score: 0.9 },
				}],
				model: "mistral-ocr-4-0",
				document_annotation: "{\"invoice_id\":\"123\"}",
				usage_info: { pages_processed: 1, doc_size_bytes: 2048 },
			}),
		}]);

		const annotationFormat = {
			type: "json_schema",
			json_schema: {
				name: "invoice",
				schema: { type: "object", properties: { invoice_id: { type: "string" } } },
				strict: true,
			},
		};
		const result = await exec(buildArgs({
			model: "mistral/ocr-4",
			document: { type: "document_url", document_url: "data:application/pdf;base64,AAAA", document_name: "invoice.pdf" },
			pages: "0,2-4",
			include_image_base64: true,
			image_limit: 4,
			image_min_size: 64,
			bbox_annotation_format: annotationFormat,
			document_annotation_format: annotationFormat,
			document_annotation_prompt: "Extract the invoice identifier",
			table_format: "html",
			extract_header: true,
			extract_footer: true,
			include_blocks: true,
			confidence_scores_granularity: "word",
		}, "mistral", OCR_4_PRICING_CARD));
		mock.restore();

		expect(capturedBody).toMatchObject({
			model: "mistral-ocr-4-0",
			document: { type: "document_url", document_url: "data:application/pdf;base64,AAAA", document_name: "invoice.pdf" },
			pages: "0,2-4",
			include_image_base64: true,
			image_limit: 4,
			image_min_size: 64,
			document_annotation_prompt: "Extract the invoice identifier",
			table_format: "html",
			extract_header: true,
			extract_footer: true,
			include_blocks: true,
			confidence_scores_granularity: "word",
		});
		expect(capturedBody?.bbox_annotation_format).toEqual(annotationFormat);
		expect(result.normalized).toMatchObject({
			text: "# Invoice",
			model: "mistral-ocr-4-0",
			document_annotation: "{\"invoice_id\":\"123\"}",
			usage: { requests: 1, input_pages: 1, pages_processed: 1, ocr_annotation_pages: 1, doc_size_bytes: 2048 },
		});
		expect((result.normalized as any)?.pages[0].blocks[0].type).toBe("title");
		expect(result.bill.cost_cents).toBe(0); // Persistence floors sub-cent totals.
		expect((result.bill.usage as any)?.pricing).toMatchObject({
			total_nanos: 5_000_000,
			total_usd_str: "0.005",
		});
	});

	it("retains the legacy image shorthand and validates annotation dependencies", async () => {
		let capturedBody: Record<string, any> | undefined;
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1/ocr"),
			onRequest: (call) => { capturedBody = call.bodyJson; },
			response: jsonResponse({ pages: [], model: "mistral-ocr-4-0", usage_info: { pages_processed: 0 } }),
		}]);
		await exec(buildArgs({ model: "mistral/ocr-4", image: "AQIDBA==" }));
		mock.restore();

		expect(capturedBody?.document).toEqual({ type: "image_url", image_url: "data:image/jpeg;base64,AQIDBA==" });
		expect(OcrSchema.safeParse({
			model: "mistral/ocr-4",
			document: { type: "image_url", image_url: "https://example.com/page.png" },
			document_annotation_prompt: "Extract fields",
		}).success).toBe(false);
		expect(OcrSchema.safeParse({ model: "mistral/ocr-4", image: "a", document: { type: "file", file_id: crypto.randomUUID() } }).success).toBe(false);
	});

	it("bills annotated pages at the annotation price and plain pages at the page price", async () => {
		const annotationFormat = { type: "json_schema", json_schema: { name: "invoice", schema: { type: "object" } } };
		const totals: number[] = [];
		for (const extra of [{}, { document_annotation_format: annotationFormat }, { bbox_annotation_format: annotationFormat }]) {
			const mock = installFetchMock([{
				match: (url) => url.endsWith("/v1/ocr"),
				response: jsonResponse({ pages: [], model: "mistral-ocr-2512", usage_info: { pages_processed: 10 } }),
			}]);
			const args = buildArgs({ model: "mistral/ocr-3", document: { type: "document_url", document_url: "https://example.com/a.pdf" }, ...extra }, "mistral", OCR_3_PRICING_CARD);
			const result = await exec({ ...args, model: "mistral/ocr-3", providerModelSlug: "mistral-ocr-2512" });
			mock.restore();
			totals.push((result.bill.usage as any)?.pricing?.total_nanos);
		}
		// 10 pages: $2 / 1,000 plain, $3 / 1,000 annotated.
		expect(totals).toEqual([20_000_000, 30_000_000, 30_000_000]);
	});
});
