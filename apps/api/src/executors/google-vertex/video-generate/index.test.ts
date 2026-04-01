import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { IRVideoGenerationRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { execute } from "./index";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";

vi.mock("@core/video-reservations", () => ({
	reserveVideoGenerationCredits: vi.fn(async () => ({
		reservationId: "video_hold:req_google_vertex_video_test",
		held: false,
		amountNanos: 0,
		status: "skip_zero_cost",
	})),
}));

vi.mock("@core/video-jobs", () => ({
	saveVideoJobMeta: vi.fn(async () => undefined),
}));

function buildArgs(ir: IRVideoGenerationRequest): ExecutorExecuteArgs {
	return {
		ir,
		requestId: "req_google_vertex_video_test",
		teamId: "team_test",
		providerId: "google-vertex",
		endpoint: "video.generation",
		protocol: "google.vertex.video",
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

describe("google-vertex video executor", () => {
	it("maps Veo request options to Vertex predictLongRunning", async () => {
		let capturedBody: any = null;
		let capturedUrl = "";
		let capturedHeaders: Record<string, string> = {};
		const mock = installFetchMock([
			{
				match: (url) => url.includes(":predictLongRunning"),
				response: jsonResponse({
					name: "projects/test-project/locations/us-east5/publishers/google/models/veo-3.1-generate-001/operations/vertex-op-123",
					done: false,
				}),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
					capturedUrl = call.url;
					capturedHeaders = call.headers;
				},
			},
		]);

		const result = await execute(buildArgs({
			model: "google/veo-3.1-generate-001",
			prompt: "A cinematic waterfall in Iceland",
			durationSeconds: 8,
			aspectRatio: "16:9",
			size: "1080p",
			sampleCount: 2,
			seed: 42,
			generateAudio: true,
			outputStorageUri: "gs://bucket/output",
			inputImage: "gs://bucket/reference-image.png",
			lastFrame: "data:image/png;base64,QUJD",
		}));

		mock.restore();

		expect(result.upstream?.status).toBe(200);
		expect(capturedUrl).toBe(
			"https://api.vertex.example/v1/projects/test-project/locations/us-east5/publishers/google/models/veo-3.1-generate-001:predictLongRunning",
		);
		expect(capturedHeaders["Authorization"]).toBe("Bearer test-vertex-key");
		expect(capturedBody?.instances?.[0]?.prompt).toBe("A cinematic waterfall in Iceland");
		expect(capturedBody?.instances?.[0]?.image?.gcsUri).toBe("gs://bucket/reference-image.png");
		expect(capturedBody?.instances?.[0]?.lastFrame?.mimeType).toBe("image/png");
		expect(capturedBody?.instances?.[0]?.lastFrame?.bytesBase64Encoded).toBe("QUJD");
		expect(capturedBody?.parameters).toMatchObject({
			durationSeconds: 8,
			aspectRatio: "16:9",
			resolution: "1080p",
			sampleCount: 2,
			seed: 42,
			generateAudio: true,
			storageUri: "gs://bucket/output",
		});
	});
});
