import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { IRVideoGenerationRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { execute } from "./index";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";

const saveVideoJobMetaMock = vi.fn(async () => undefined);
const state = vi.hoisted(() => ({
	reservationResult: null as Record<string, unknown> | null,
	reservationCalls: [] as Array<Record<string, unknown>>,
	releaseCalls: [] as Array<Record<string, unknown>>,
	saveVideoJobMetaError: null as Error | null,
}));

vi.mock("@core/video-reservations", () => ({
	isInsufficientVideoReservationStatus: (status: unknown) =>
		status === "insufficient_funds" || status === "insufficient_balance",
	reserveVideoGenerationCredits: vi.fn(async (args: Record<string, unknown>) => {
		state.reservationCalls.push(args);
		return (
		state.reservationResult ?? {
			reservationId: "video_hold:req_google_video_test",
			held: false,
			amountNanos: 0,
			status: "skip_zero_cost",
		});
	}),
}));

vi.mock("@core/video-jobs", () => ({
	saveVideoJobMeta: (...args: unknown[]) => {
		if (state.saveVideoJobMetaError && (args[2] as any).submissionState !== "submitting") throw state.saveVideoJobMetaError;
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
		apiKeyId: "key_google_video_test",
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
		state.reservationCalls = [];
		state.releaseCalls = [];
		state.saveVideoJobMetaError = null;
	});

	it.each(["sampleCount", "numberOfVideos"])("rejects multiple outputs via %s before reserving or submitting", async (field) => {
		const mock = installFetchMock([]);
		try {
			const result = await execute(buildArgs({ model: "veo-3.1-generate-preview", prompt: "test", [field]: 2 } as any));
			expect(result.upstream.status).toBe(400);
			expect(state.reservationCalls).toEqual([]);
			expect(saveVideoJobMetaMock).not.toHaveBeenCalled();
		} finally { mock.restore(); }
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
			negativePrompt: "blurry, noisy",
			numberOfVideos: 1,
			seed: 42,
			personGeneration: "allow_adult",
			generateAudio: true,
			inputImage: "gs://bucket/reference-image.png",
			lastFrame: "data:image/png;base64,QUJD",
		}));

		mock.restore();

		expect(result.upstream?.status).toBe(200);
		expect(capturedUrl).toContain("/v1beta/models/veo-3.1-generate-preview:predictLongRunning");
		expect(capturedUrl).not.toContain("?key=");
		expect(capturedHeaders["x-goog-api-key"]).toBe("test-google-key");
		expect(capturedBody?.instances?.[0]?.prompt).toBe("A cinematic waterfall in Iceland");
		expect(capturedBody?.instances?.[0]?.image?.gcsUri).toBe("gs://bucket/reference-image.png");
		expect(capturedBody?.instances?.[0]?.lastFrame?.inlineData?.mimeType).toBe("image/png");
		expect(capturedBody?.instances?.[0]?.lastFrame?.inlineData?.data).toBe("QUJD");
		expect(capturedBody?.parameters).toMatchObject({
			durationSeconds: 8,
			aspectRatio: "16:9",
			resolution: "1080p",
			negativePrompt: "blurry, noisy",
			seed: 42,
			personGeneration: "allow_adult",
		});
		expect(capturedBody?.parameters).not.toHaveProperty("numberOfVideos");
		expect(state.reservationCalls[0]).toMatchObject({ seconds: 8 });
		expect(saveVideoJobMetaMock).toHaveBeenCalledWith(
			"team_test",
			"req_google_video_test",
			expect.objectContaining({ seconds: 8, outputCount: 1 }),
			expect.any(String),
			expect.any(String),
		);
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
		expect(capturedBody?.parameters).not.toHaveProperty("numberOfVideos");
	});

	it("maps normalized IR reference images and defaults billable dimensions", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([{
			match: (url) => url.includes(":predictLongRunning"),
			response: jsonResponse({ name: "operations/veo-references", done: false }),
			onRequest: (call) => { capturedBody = call.bodyJson; },
		}]);
		const result = await execute(buildArgs({
			model: "google/veo-3.1-preview",
			prompt: "Keep the product consistent across the shot",
			inputReferences: [
				{ type: "image", role: "reference", url: "gs://bucket/product.png", referenceType: "asset" },
			],
		}));
		mock.restore();

		expect(result.upstream?.status).toBe(200);
		expect(capturedBody?.instances?.[0]?.referenceImages?.[0]).toMatchObject({
			referenceType: "asset",
			image: { gcsUri: "gs://bucket/product.png" },
		});
		expect(capturedBody?.parameters).toMatchObject({ durationSeconds: 8, resolution: "720p", aspectRatio: "16:9" });
		expect(state.reservationCalls.at(-1)).toMatchObject({ seconds: 8 });
	});

	it("includes source-video meters in the reservation", async () => {
		const mock = installFetchMock([{
			match: (url) => url.includes(":predictLongRunning"),
			response: jsonResponse({ name: "operations/veo-extension", done: false }),
		}]);
		const result = await execute(buildArgs({
			model: "google/veo-3.1-preview",
			prompt: "Extend this clip",
			durationSeconds: 8,
			resolution: "720p",
			inputVideoDurationSeconds: 7.5,
			inputReferences: [{ type: "video", role: "source", url: "https://example.com/source.mp4" }],
		}));
		mock.restore();

		expect(result.upstream?.status).toBe(200);
		expect(state.reservationCalls.at(-1)).toMatchObject({
			requestOptions: {
				input_video_count: 1,
				input_video_seconds: 7.5,
			},
		});
	});

	it("rejects invalid Veo combinations before provider submission", async () => {
		const mock = installFetchMock([]);
		const result = await execute(buildArgs({
			model: "google/veo-3.1-preview",
			prompt: "A silent clip",
			generateAudio: false,
		}));
		mock.restore();

		expect(result.upstream?.status).toBe(400);
		expect(await result.upstream?.clone().json()).toMatchObject({ error: { type: "invalid_request" } });
		expect(mock.calls).toEqual([]);
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
		expect(saveVideoJobMetaMock).toHaveBeenCalledTimes(1);
		expect(state.releaseCalls).toEqual([]);
	});

	it("retains a held reservation when Google returns success without an operation name", async () => {
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
		expect(state.releaseCalls).toEqual([]);
	});

	it("does not dispatch when the key cannot cover the video hold", async () => {
		state.reservationResult = { reservationId: "video_hold:req_google_video_test", held: false,
			amountNanos: 200_000_000, status: "daily_cost_limit_reached" };
		const mock = installFetchMock([]);
		const result = await execute(buildArgs({ model: "google/veo-3.1-generate-preview", prompt: "cap test", seconds: 8, size: "720p" }));
		mock.restore();
		expect(result.upstream?.status).toBe(503);
		expect(result.ir).toBeUndefined();
		expect(mock.calls).toEqual([]);
		expect(state.reservationCalls[0]).toMatchObject({ keyId: "key_google_video_test" });
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
