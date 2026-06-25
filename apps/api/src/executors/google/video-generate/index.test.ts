import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { IRVideoGenerationRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { execute } from "./index";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";

const saveVideoJobMetaMock = vi.fn(async () => undefined);
const state = vi.hoisted(() => ({
	reservationResult: null as Record<string, unknown> | null,
	releaseCalls: [] as Array<Record<string, unknown>>,
	saveVideoJobMetaError: null as Error | null,
}));

vi.mock("@core/video-reservations", () => ({
	isInsufficientVideoReservationStatus: (status: unknown) =>
		status === "insufficient_funds" || status === "insufficient_balance",
	reserveVideoGenerationCredits: vi.fn(async () => (
		state.reservationResult ?? {
			reservationId: "video_hold:req_google_video_test",
			held: false,
			amountNanos: 0,
			status: "skip_zero_cost",
		}
	)),
}));

vi.mock("@core/video-jobs", () => ({
	saveVideoJobMeta: (...args: unknown[]) => {
		if (state.saveVideoJobMetaError) throw state.saveVideoJobMetaError;
		return saveVideoJobMetaMock(...args);
	},
}));

vi.mock("@core/wallet-reservations", () => ({
	releaseWalletReservation: vi.fn(async (args: Record<string, unknown>) => {
		state.releaseCalls.push(args);
		return {
			status: "released",
			applied: true,
			alreadyApplied: false,
			amountNanos: 123_000_000,
			beforeBalanceNanos: null,
			afterBalanceNanos: null,
			beforeReservedNanos: null,
			afterReservedNanos: null,
		};
	}),
}));

function buildArgs(ir: IRVideoGenerationRequest): ExecutorExecuteArgs {
	return {
		ir,
		requestId: "req_google_video_test",
		workspaceId: "team_test",
		providerId: "google-ai-studio",
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
	beforeEach(() => {
		saveVideoJobMetaMock.mockClear();
		state.reservationResult = null;
		state.releaseCalls = [];
		state.saveVideoJobMetaError = null;
	});

	it("maps Veo request options and media inputs", async () => {
		let capturedBody: any = null;
		let capturedUrl = "";
		let capturedHeaders: Record<string, string> = {};
		const mock = installFetchMock([
			{
				match: (url) => url.includes(":predictLongRunning"),
				response: jsonResponse({ name: "operations/veo-123", done: false }),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
					capturedUrl = call.url;
					capturedHeaders = call.headers;
				},
			},
		]);

		const result = await execute(buildArgs({
			model: "google/veo-3.1-generate-preview",
			prompt: "A cinematic waterfall in Iceland",
			durationSeconds: 8,
			aspectRatio: "16:9",
			size: "1080p",
			compressionQuality: 80,
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
		expect(capturedUrl).toContain("/v1beta/models/veo-3.1-generate-preview:predictLongRunning");
		expect(capturedUrl).not.toContain("?key=");
		expect(capturedHeaders["x-goog-api-key"]).toBe("test-google-key");
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
			compressionQuality: 80,
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
		let capturedUrl = "";
		let capturedHeaders: Record<string, string> = {};
		const mock = installFetchMock([
			{
				match: (url) => url.includes(":predictLongRunning"),
				response: jsonResponse({ name: "operations/veo-456", done: false }),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
					capturedUrl = call.url;
					capturedHeaders = call.headers;
				},
			},
		]);

		const result = await execute(buildArgs({
			model: "google/veo-3.1-fast-preview",
			prompt: "A close-up of raindrops on leaves",
			inputReference: "https://example.com/ref.png",
			resolution: "720p",
			sampleCount: 1,
		}));

		mock.restore();

		expect(result.upstream?.status).toBe(200);
		expect(capturedUrl).toContain("/v1beta/models/veo-3.1-fast-generate-preview:predictLongRunning");
		expect(capturedUrl).not.toContain("?key=");
		expect(capturedHeaders["x-goog-api-key"]).toBe("test-google-key");
		expect(capturedBody?.instances?.[0]?.image?.uri).toBe("https://example.com/ref.png");
		expect(capturedBody?.parameters?.resolution).toBe("720p");
		expect(capturedBody?.parameters?.numberOfVideos).toBe(1);
	});

	it("fails the gateway response when Google video metadata cannot be persisted", async () => {
		state.reservationResult = {
			reservationId: "video_hold:req_google_video_test",
			held: true,
			amountNanos: 123_000_000,
			status: "held",
		};
		state.saveVideoJobMetaError = new Error("async operation store unavailable");
		const mock = installFetchMock([
			{
				match: (url) => url.includes(":predictLongRunning"),
				response: jsonResponse({ name: "operations/veo-meta-failed", done: false }),
			},
		]);

		const result = await execute(buildArgs({
			model: "google/veo-3.1-generate-preview",
			prompt: "A Google metadata persistence failure",
			durationSeconds: 8,
			size: "1080p",
		}));

		mock.restore();

		expect(result.upstream?.status).toBe(502);
		expect(await result.upstream?.clone().json()).toMatchObject({
			error: {
				type: "async_job_persistence_failed",
				native_video_id: expect.stringContaining("gaiop_"),
				reservation_id: "video_hold:req_google_video_test",
				reservation_status: "held",
			},
		});
		expect(result.ir).toBeUndefined();
		expect(saveVideoJobMetaMock).not.toHaveBeenCalled();
		expect(state.releaseCalls).toEqual([]);
	});

	it("releases a held reservation when Google returns success without an operation name", async () => {
		state.reservationResult = {
			reservationId: "video_hold:req_google_video_test",
			held: true,
			amountNanos: 123_000_000,
			status: "held",
		};
		const mock = installFetchMock([
			{
				match: (url) => url.includes(":predictLongRunning"),
				response: jsonResponse({ done: false }),
			},
		]);

		const result = await execute(buildArgs({
			model: "google/veo-3.1-generate-preview",
			prompt: "A Google response without an operation name",
			durationSeconds: 8,
			size: "1080p",
		}));

		mock.restore();

		expect(result.upstream?.status).toBe(502);
		expect(await result.upstream?.clone().json()).toMatchObject({
			error: {
				type: "invalid_upstream_response",
			},
		});
		expect(result.ir).toBeUndefined();
		expect(state.releaseCalls).toEqual([
			{
				workspaceId: "team_test",
				reservationId: "video_hold:req_google_video_test",
				releaseRefId: "req_google_video_test",
			},
		]);
	});

	it("does not submit upstream when reservation pricing dimensions are missing", async () => {
		state.reservationResult = {
			reservationId: "video_hold:req_google_video_test",
			held: false,
			amountNanos: 0,
			status: "skip_missing_seconds_or_pricing",
		};
		const mock = installFetchMock([
			{
				match: (url) => url.includes(":predictLongRunning"),
				response: jsonResponse({ name: "operations/should-not-submit", done: false }),
			},
		]);

		const result = await execute(buildArgs({
			model: "google/veo-3.1-generate-preview",
			prompt: "A Google request without duration pricing dimensions",
			size: "1080p",
		}));

		mock.restore();

		expect(result.upstream?.status).toBe(400);
		expect(await result.upstream?.clone().json()).toMatchObject({
			error: {
				type: "missing_billing_dimensions",
			},
		});
		expect(result.ir).toBeUndefined();
		expect(state.releaseCalls).toEqual([]);
		expect(mock.calls).toEqual([]);
	});
});
