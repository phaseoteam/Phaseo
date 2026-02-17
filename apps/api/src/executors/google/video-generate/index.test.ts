import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IRVideoGenerationRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { execute } from "./index";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";

function buildArgs(ir: IRVideoGenerationRequest): ExecutorExecuteArgs {
	return {
		ir,
		requestId: "req_google_video_test",
		teamId: "team_test",
		providerId: "google",
		endpoint: "video.generation",
		protocol: "google.video",
		capability: "video.generate",
		providerModelSlug: null,
		capabilityParams: null,
		byokMeta: [],
		pricingCard: null,
		meta: {},
	} as ExecutorExecuteArgs;
}

beforeAll(() => {
	setupTestRuntime();
});

afterAll(() => {
	teardownTestRuntime();
});

describe("google video executor", () => {
	it("maps Veo request options and media inputs", async () => {
		let capturedBody: any = null;
		let capturedUrl = "";
		const mock = installFetchMock([
			{
				match: (url) => url.includes(":predictLongRunning"),
				response: jsonResponse({ name: "operations/veo-123", done: false }),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
					capturedUrl = call.url;
				},
			},
		]);

		const result = await execute(buildArgs({
			model: "google/veo-3.1-generate-preview",
			prompt: "A cinematic waterfall in Iceland",
			durationSeconds: 8,
			aspectRatio: "16:9",
			resolution: "1080p",
			negativePrompt: "blurry, noisy",
			numberOfVideos: 2,
			seed: 42,
			personGeneration: "allow",
			generateAudio: true,
			enhancePrompt: false,
			outputStorageUri: "gs://bucket/output",
			inputImage: "gs://bucket/reference-image.png",
			inputVideo: { gcs_uri: "gs://bucket/input-video.mp4" },
			lastFrame: "data:image/png;base64,QUJD",
			referenceImages: [
				{
					reference_type: "REFERENCE_TYPE_STYLE",
					uri: "gs://bucket/style-image.png",
				},
			],
		}));

		mock.restore();

		expect(result.upstream?.status).toBe(200);
		expect(capturedUrl).toContain("/v1beta/models/google%2Fveo-3.1-generate-preview:predictLongRunning?key=");
		expect(capturedBody?.instances?.[0]?.prompt).toBe("A cinematic waterfall in Iceland");
		expect(capturedBody?.instances?.[0]?.image?.gcsUri).toBe("gs://bucket/reference-image.png");
		expect(capturedBody?.instances?.[0]?.video?.gcsUri).toBe("gs://bucket/input-video.mp4");
		expect(capturedBody?.instances?.[0]?.lastFrame?.mimeType).toBe("image/png");
		expect(capturedBody?.instances?.[0]?.lastFrame?.imageBytes).toBe("QUJD");
		expect(capturedBody?.instances?.[0]?.referenceImages?.[0]?.referenceType).toBe("REFERENCE_TYPE_STYLE");
		expect(capturedBody?.instances?.[0]?.referenceImages?.[0]?.image?.gcsUri).toBe("gs://bucket/style-image.png");
		expect(capturedBody?.parameters).toMatchObject({
			durationSeconds: 8,
			aspectRatio: "16:9",
			resolution: "1080p",
			negativePrompt: "blurry, noisy",
			numberOfVideos: 2,
			seed: 42,
			personGeneration: "allow",
			generateAudio: true,
			enhancePrompt: false,
			storageUri: "gs://bucket/output",
		});
	});

	it("uses input_reference and sample_count aliases for Veo", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url.includes(":predictLongRunning"),
				response: jsonResponse({ name: "operations/veo-456", done: false }),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
			},
		]);

		const result = await execute(buildArgs({
			model: "google/veo-3.1-fast-preview",
			prompt: "A close-up of raindrops on leaves",
			inputReference: "https://example.com/ref.png",
			sampleCount: 1,
		}));

		mock.restore();

		expect(result.upstream?.status).toBe(200);
		expect(capturedBody?.instances?.[0]?.image?.uri).toBe("https://example.com/ref.png");
		expect(capturedBody?.parameters?.numberOfVideos).toBe(1);
	});
});
