import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { execute as executeNonTextAdapter } from "./adapter-bridge";

const PRICING_CARD = {
	provider: "google-ai-studio",
	model: "test-model",
	endpoint: "images.generations",
	effective_from: null,
	effective_to: null,
	currency: "USD",
	version: null,
	rules: [
		{
			meter: "requests",
			unit: "request",
			unit_size: 1,
			price_per_unit: 1,
			currency: "USD",
			pricing_plan: "standard",
			note: null,
			match: [],
			priority: 100,
			effective_from: null,
			effective_to: null,
		},
	],
} as any;

const OCR_PRICING_CARD = {
	provider: "mistral",
	model: "mistral/ocr-4",
	endpoint: "ocr",
	effective_from: null,
	effective_to: null,
	currency: "USD",
	version: null,
	rules: [
		{
			meter: "input_pages",
			unit: "page",
			unit_size: 1000,
			price_per_unit: 4,
			currency: "USD",
			pricing_plan: "standard",
			match: [],
			priority: 100,
			effective_from: null,
			effective_to: null,
		},
	],
} as any;

beforeAll(() => {
	setupTestRuntime();
});

afterAll(() => {
	teardownTestRuntime();
});

describe("non-text adapter bridge", () => {
	it("routes google-ai-studio images to the dedicated provider adapter", async () => {
		let capturedUrl = "";
		const mock = installFetchMock([
			{
				match: (url) => {
					try {
						const parsed = new URL(url);
						return (
							parsed.hostname === "generativelanguage.googleapis.com" &&
							parsed.pathname.includes(":generateContent") &&
							parsed.searchParams.has("key")
						);
					} catch {
						return false;
					}
				},
				response: jsonResponse({
					candidates: [
						{
							content: {
								parts: [
									{
										inlineData: {
											mimeType: "image/png",
											data: "abc123",
										},
									},
								],
							},
						},
					],
				}),
				onRequest: (call) => {
					capturedUrl = call.url;
				},
			},
		]);

		const result = await executeNonTextAdapter({
			ir: {
				type: "image.generation",
				model: "google/gemini-3.1-flash-image-preview",
				prompt: "A fox in watercolor.",
				n: 1,
			},
			requestId: "req_non_text_google_image_1",
			workspaceId: "team_test",
			providerId: "google-ai-studio",
			endpoint: "images.generations",
			providerModelSlug: "gemini-3.1-flash-image-preview",
			byokMeta: [],
			pricingCard: PRICING_CARD,
			meta: {},
		} as any);

		mock.restore();

		expect(capturedUrl).toContain("generativelanguage.googleapis.com");
		expect(capturedUrl).toContain(":generateContent?key=");
		expect(result.kind).toBe("completed");
		if (result.kind === "completed") {
			expect(result.ir?.provider).toBe("google-ai-studio");
			expect((result.ir as any)?.data?.[0]?.b64Json).toBe("abc123");
		}
	});

	it("forwards Mistral OCR provider options through the non-text bridge", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url === "https://api.mistral.example/v1/ocr",
				response: jsonResponse({
					pages: [{ index: 0, markdown: "ok" }],
					model: "mistral-ocr-4-0",
					usage_info: { pages_processed: 1, doc_size_bytes: null },
				}),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
			},
		]);

		const result = await executeNonTextAdapter({
			ir: {
				type: "ocr",
				model: "mistral/ocr-4",
				image: "https://example.com/document.png",
				vendor: {
					mistral: {
						document_annotation_format: { type: "json_object" },
						document_annotation_prompt: "Extract document metadata.",
					},
				},
			},
			requestId: "req_non_text_mistral_ocr_1",
			workspaceId: "team_test",
			providerId: "mistral",
			endpoint: "ocr",
			providerModelSlug: "mistral-ocr-4-0",
			byokMeta: [],
			pricingCard: OCR_PRICING_CARD,
			meta: {},
		} as any);

		mock.restore();

		expect(capturedBody).toMatchObject({
			model: "mistral-ocr-4-0",
			document: {
				type: "image_url",
				image_url: "https://example.com/document.png",
			},
			document_annotation_format: { type: "json_object" },
			document_annotation_prompt: "Extract document metadata.",
		});
		expect(result.kind).toBe("completed");
		if (result.kind === "completed") {
			expect((result.ir as any)?.usage?.input_pages).toBe(1);
		}
	});
});
