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
	it("maps custom video request shape into OpenAI-compatible upstream payload", async () => {
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
				duration: 8,
				resolution: "1280x720",
				aspect_ratio: "16:9",
				sample_count: 2,
				input_references: [
					{
						type: "image_url",
						image_url: {
							url: "https://storage.googleapis.com/reference.png",
						},
					},
				],
				generate_audio: true,
				enhance_prompt: true,
			},
			meta: REQUEST_META,
			teamId: "team_test",
			providerId: "google-ai-studio",
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
		expect(capturedBody.resolution).toBe("1280x720");
		expect(capturedBody.input_reference).toBe(
			"https://storage.googleapis.com/reference.png",
		);
		expect(capturedBody.aspect_ratio).toBe("16:9");
		expect(capturedBody.sample_count).toBe(2);
		expect(capturedBody.generate_audio).toBe(true);
		expect(capturedBody.enhance_prompt).toBe(true);
	});

	it("maps provider_params options into flat request fields", async () => {
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
				provider_params: {
					aspectRatio: "4:3",
					compressionQuality: 75,
					durationSeconds: 6,
					generateAudio: true,
					negativePrompt: "grainy",
					resolution: "1080p",
				},
			},
			meta: REQUEST_META,
			teamId: "team_test",
			providerId: "google-ai-studio",
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
