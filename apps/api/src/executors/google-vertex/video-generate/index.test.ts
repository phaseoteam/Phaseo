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
			reservationId: "video_hold:req_google_vertex_video_test",
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
		requestId: "req_google_vertex_video_test",
		workspaceId: "team_test",
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
	beforeEach(() => {
		saveVideoJobMetaMock.mockClear();
		state.reservationResult = null;
		state.reservationCalls = [];
		state.releaseCalls = [];
		state.saveVideoJobMetaError = null;
	});

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
		expect(state.reservationCalls[0]).toMatchObject({
			seconds: 16,
			requestOptions: expect.objectContaining({
				size: "1080p",
				sample_count: 2,
				video_params: expect.objectContaining({ audio: true }),
			}),
		});
		expect(saveVideoJobMetaMock).toHaveBeenCalledWith(
			"team_test",
			"req_google_vertex_video_test",
			expect.objectContaining({ seconds: 8, outputCount: 2 }),
			expect.any(String),
			expect.any(String),
		);
	});

	it("maps normalized IR first, last, and reference images", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([{
			match: (url) => url.includes(":predictLongRunning"),
			response: jsonResponse({
				name: "projects/test-project/locations/us-east5/publishers/google/models/veo-3.1-generate-preview/operations/vertex-ir-refs",
				done: false,
			}),
			onRequest: (call) => { capturedBody = call.bodyJson; },
		}]);
		const result = await execute(buildArgs({
			model: "google/veo-3.1-preview",
			prompt: "Keep the subject consistent",
			durationSeconds: 8,
			inputReferences: [
				{ type: "image", role: "first_frame", url: "gs://bucket/first.png" },
				{ type: "image", role: "last_frame", url: "gs://bucket/last.png" },
				{ type: "image", role: "reference", url: "gs://bucket/subject.png", referenceType: "asset" },
			],
		}));
		mock.restore();

		expect(result.upstream?.status).toBe(200);
		expect(capturedBody.instances[0]).toMatchObject({
			image: { gcsUri: "gs://bucket/first.png" },
			lastFrame: { gcsUri: "gs://bucket/last.png" },
			referenceImages: [{ image: { gcsUri: "gs://bucket/subject.png" }, referenceType: "asset" }],
		});
		expect(state.reservationCalls[0]).toMatchObject({
			requestOptions: expect.objectContaining({
				size: "720p",
				video_params: expect.objectContaining({ audio: true }),
			}),
		});
	});

	it("fails the gateway response when Vertex video metadata cannot be persisted", async () => {
		state.reservationResult = {
			reservationId: "video_hold:req_google_vertex_video_test",
			held: true,
			amountNanos: 123_000_000,
			status: "held",
		};
		state.saveVideoJobMetaError = new Error("async operation store unavailable");
		const mock = installFetchMock([
			{
				match: (url) => url.includes(":predictLongRunning"),
				response: jsonResponse({
					name: "projects/test-project/locations/us-east5/publishers/google/models/veo-3.1-generate-001/operations/vertex-meta-failed",
					done: false,
				}),
			},
		]);

		const result = await execute(buildArgs({
			model: "google/veo-3.1-generate-001",
			prompt: "A Vertex metadata persistence failure",
			durationSeconds: 8,
			size: "1080p",
		}));

		mock.restore();

		expect(result.upstream?.status).toBe(502);
		expect(await result.upstream?.clone().json()).toMatchObject({
			error: {
				type: "async_job_persistence_failed",
				native_video_id: expect.stringContaining("gvtxop_"),
				reservation_id: "video_hold:req_google_vertex_video_test",
				reservation_status: "held",
			},
		});
		expect(result.ir).toBeUndefined();
		expect(saveVideoJobMetaMock).toHaveBeenCalledTimes(1);
		expect(state.releaseCalls).toEqual([]);
	});

	it("retains a held reservation when Vertex returns success without an operation name", async () => {
		state.reservationResult = {
			reservationId: "video_hold:req_google_vertex_video_test",
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
			model: "google/veo-3.1-generate-001",
			prompt: "A Vertex response without an operation name",
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

	it("does not submit upstream when reservation pricing dimensions are missing", async () => {
		state.reservationResult = {
			reservationId: "video_hold:req_google_vertex_video_test",
			held: false,
			amountNanos: 0,
			status: "skip_missing_seconds_or_pricing",
		};
		const mock = installFetchMock([
			{
				match: (url) => url.includes(":predictLongRunning"),
				response: jsonResponse({
					name: "projects/test-project/locations/us-east5/publishers/google/models/veo-3.1-generate-001/operations/should-not-submit",
					done: false,
				}),
			},
		]);

		const result = await execute(buildArgs({
			model: "google/veo-3.1-generate-001",
			prompt: "A Vertex request without duration pricing dimensions",
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
