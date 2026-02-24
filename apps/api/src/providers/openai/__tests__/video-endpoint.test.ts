import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { exec as execVideo } from "../endpoints/video";

const REQUEST_META = {
	requestId: "req_test_video_1",
	apiKeyId: "key_test",
	apiKeyRef: "kid_test",
	apiKeyKid: "kid_test",
};

const PRICING_CARD = {
	provider: "openai",
	model: "test-model",
	endpoint: "video.generation",
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

describe("OpenAI-compatible video endpoint payload mapping", () => {
	it("keeps OpenAI-compatible core shape and preserves Veo superset fields for non-openai providers", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/videos"),
				response: jsonResponse({ id: "vid_123", status: "queued" }),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
			},
		]);

		const result = await execVideo({
			endpoint: "video.generation",
			model: "google/veo-3.1-generate-preview",
			body: {
				model: "google/veo-3.1-generate-preview",
				prompt: "A slow cinematic drone shot over a snow mountain.",
				seconds: 8,
				size: "1280x720",
				input_reference: "https://storage.googleapis.com/reference.png",
				aspect_ratio: "16:9",
				number_of_videos: 2,
				reference_images: [
					{
						reference_type: "style",
						uri: "gs://bucket/style-reference.png",
					},
				],
				generate_audio: true,
				enhance_prompt: true,
			},
			meta: REQUEST_META,
			teamId: "team_test",
			providerId: "google",
			byokMeta: [],
			pricingCard: PRICING_CARD,
			providerModelSlug: null,
			stream: false,
		} as any);

		mock.restore();

		expect(result.upstream.status).toBe(200);
		expect(capturedBody.model).toBe("google/veo-3.1-generate-preview");
		expect(capturedBody.prompt).toContain("cinematic");
		expect(capturedBody.seconds).toBe(8);
		expect(capturedBody.size).toBe("1280x720");
		expect(capturedBody.input_reference).toBe(
			"https://storage.googleapis.com/reference.png",
		);
		expect(capturedBody.aspect_ratio).toBe("16:9");
		expect(capturedBody.number_of_videos).toBe(2);
		expect(capturedBody.generate_audio).toBe(true);
		expect(capturedBody.enhance_prompt).toBe(true);
		expect(Array.isArray(capturedBody.reference_images)).toBe(true);
	});

	it("maps google provider-scoped options from config.google into flat request fields", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/videos"),
				response: jsonResponse({ id: "vid_789", status: "queued" }),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
			},
		]);

		const result = await execVideo({
			endpoint: "video.generation",
			model: "google/veo-3.1-generate-preview",
			body: {
				model: "google/veo-3.1-generate-preview",
				prompt: "A close-up of ocean waves at sunset.",
				config: {
					google: {
						aspectRatio: "4:3",
						compressionQuality: 75,
						durationSeconds: 6,
						generateAudio: true,
						negativePrompt: "grainy",
						resolution: "1080p",
					},
				},
			},
			meta: REQUEST_META,
			teamId: "team_test",
			providerId: "google",
			byokMeta: [],
			pricingCard: PRICING_CARD,
			providerModelSlug: null,
			stream: false,
		} as any);

		mock.restore();

		expect(result.upstream.status).toBe(200);
		expect(capturedBody.aspect_ratio).toBe("4:3");
		expect(capturedBody.compression_quality).toBe(75);
		expect(capturedBody.seconds).toBe(6);
		expect(capturedBody.generate_audio).toBe(true);
		expect(capturedBody.negative_prompt).toBe("grainy");
		expect(capturedBody.resolution).toBe("1080p");
	});
});
