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
			teamId: "team_test",
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
			teamId: "team_test",
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
			teamId: "team_test",
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
