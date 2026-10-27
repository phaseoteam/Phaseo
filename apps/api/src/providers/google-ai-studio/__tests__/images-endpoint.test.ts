import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { exec as execImages } from "../endpoints/images";

const REQUEST_META = {
	requestId: "req_test_google_images_1",
	apiKeyId: "key_test",
	apiKeyRef: "kid_test",
	apiKeyKid: "kid_test",
};

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

beforeAll(() => {
	setupTestRuntime();
});

afterAll(() => {
	teardownTestRuntime();
});

describe("google-ai-studio images endpoint", () => {
	it("routes gemini image models through generateContent and forces image-only modality", async () => {
		let capturedUrl = "";
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url.includes(":generateContent?key="),
				response: jsonResponse({
					candidates: [
						{
							finishReason: "STOP",
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
					usageMetadata: {
						promptTokenCount: 10,
						candidatesTokenCount: 20,
						totalTokenCount: 30,
					},
				}),
				onRequest: (call) => {
					capturedUrl = call.url;
					capturedBody = call.bodyJson;
				},
			},
		]);

		const result = await execImages({
			endpoint: "images.generations",
			model: "google/gemini-3.1-flash-image-preview",
			body: {
				model: "google/gemini-3.1-flash-image-preview",
				prompt: "A painted fox in a snowy forest.",
				n: 2,
				size: "1536x1024",
				quality: "2K",
			},
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "google-ai-studio",
			byokMeta: [],
			pricingCard: PRICING_CARD,
			providerModelSlug: "gemini-3.1-flash-image-preview",
			stream: false,
		} as any);

		mock.restore();

		expect(capturedUrl).toContain(":generateContent?key=");
		expect(capturedBody?.generationConfig?.responseModalities).toEqual(["IMAGE"]);
		expect(capturedBody?.generationConfig?.candidateCount).toBe(2);
		expect(capturedBody?.generationConfig?.imageConfig).toEqual({
			aspectRatio: "3:2",
			imageSize: "2K",
		});
		expect(result.upstream.status).toBe(200);
		expect(result.normalized?.data?.[0]?.b64_json).toBe("abc123");
		expect(result.bill.cost_cents).toBeGreaterThan(0);
	});

	it("maps non-reduced google dimensions to supported aspect ratios", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url.includes(":generateContent?key="),
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
					capturedBody = call.bodyJson;
				},
			},
		]);

		const result = await execImages({
			endpoint: "images.generations",
			model: "google/gemini-3.1-flash-image-preview",
			body: {
				model: "google/gemini-3.1-flash-image-preview",
				prompt: "A portrait image.",
				size: "768x1376",
				quality: "1K",
			},
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "google-ai-studio",
			byokMeta: [],
			pricingCard: PRICING_CARD,
			providerModelSlug: "gemini-3.1-flash-image-preview",
			stream: false,
		} as any);

		mock.restore();

		expect(result.upstream.status).toBe(200);
		expect(capturedBody?.generationConfig?.imageConfig?.aspectRatio).toBe("9:16");
	});

	it("routes non-gemini image models through generateImage", async () => {
		let capturedUrl = "";
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url.includes(":generateImage?key="),
				response: jsonResponse({
					generatedImages: [
						{
							image: {
								imageBytes: "xyz789",
							},
						},
					],
				}),
				onRequest: (call) => {
					capturedUrl = call.url;
					capturedBody = call.bodyJson;
				},
			},
		]);

		const result = await execImages({
			endpoint: "images.generations",
			model: "google/imagen-4.0-generate-preview-06-06",
			body: {
				model: "google/imagen-4.0-generate-preview-06-06",
				prompt: "A minimalist skyline at sunset.",
				n: 1,
				size: "1024x1024",
			},
			meta: REQUEST_META,
			workspaceId: "team_test",
			providerId: "google-ai-studio",
			byokMeta: [],
			pricingCard: PRICING_CARD,
			providerModelSlug: "imagen-4.0-generate-preview-06-06",
			stream: false,
		} as any);

		mock.restore();

		expect(capturedUrl).toContain(":generateImage?key=");
		expect(capturedBody?.prompt).toBe("A minimalist skyline at sunset.");
		expect(capturedBody?.numberOfImages).toBe(1);
		expect(capturedBody?.aspectRatio).toBe("1:1");
		expect(capturedBody?.generationConfig).toBeUndefined();
		expect(result.upstream.status).toBe(200);
		expect(result.normalized?.data?.[0]?.b64_json).toBe("xyz789");
	});
});

describe("google-ai-studio images endpoint billing (Gemini 3 Pro Image)", () => {
	// Production rows: input unconditional, output_image_tokens only where
	// image_params.resolution is 1K or 2K, at $120 per 1M tokens.
	const tokenRule = (meter: string, price: string, match: unknown[] = []) => ({
		meter, unit: "token", unit_size: 1_000_000, price_per_unit: price, currency: "USD",
		pricing_plan: "standard", note: null, match, priority: 100,
	});
	const card = {
		provider: "google-ai-studio", model: "google/gemini-3-pro-image", endpoint: "image.generate",
		effective_from: null, effective_to: null, currency: "USD", version: null,
		rules: [
			tokenRule("input_text_tokens", "2"),
			tokenRule("output_image_tokens", "120", [
				{ path: "image_params.resolution", op: "in", value: ["1K", "2K"], or_group: 1, and_index: 1 },
			]),
		],
	} as any;

	const run = async (body: Record<string, unknown>, imageTokens: number) => {
		const mock = installFetchMock([{
			match: (url) => url.includes("gemini-3-pro-image-preview:generateContent"),
			response: jsonResponse({
				candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "img" } }] } }],
				usageMetadata: {
					promptTokenCount: 10,
					candidatesTokenCount: imageTokens,
					totalTokenCount: 10 + imageTokens,
					promptTokensDetails: [{ modality: "TEXT", tokenCount: 10 }],
					candidatesTokensDetails: [{ modality: "IMAGE", tokenCount: imageTokens }],
				},
			}),
		}]);
		try {
			return await execImages({
				endpoint: "images.generations",
				model: "google/gemini-3-pro-image",
				providerModelSlug: "gemini-3-pro-image-preview",
				body: { model: "google/gemini-3-pro-image", prompt: "a lighthouse", ...body },
				meta: REQUEST_META,
				workspaceId: "team_test",
				providerId: "google-ai-studio",
				byokMeta: [],
				pricingCard: card,
				stream: false,
			} as any);
		} finally {
			mock.restore();
		}
	};

	it.each([
		["no quality (Google's 1K default)", {}, 1120, 134_420_000, undefined],
		["quality 2K", { quality: "2K" }, 1120, 134_420_000, undefined],
		["quality 4K (no 4K row: base rate)", { quality: "4K" }, 2000, 240_020_000, "base_rate"],
	])("prices %s without throwing after Google has charged", async (_label, body, imageTokens, expectedNanos, fallback) => {
		// Before: pricing_rule_missing:output_image_tokens thrown from the adapter, then a
		// second paid image on another provider.
		const result = await run(body, imageTokens);
		expect(result.bill.usage.pricing.total_nanos).toBe(expectedNanos);
		const outputLine = result.bill.usage.pricing.lines.find((line: any) => line.dimension === "output_image_tokens");
		expect(outputLine?.pricing_fallback).toBe(fallback);
	});
});
