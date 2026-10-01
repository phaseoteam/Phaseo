import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { IRVideoGenerationRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { execute } from "./index";
import { VideoGenerationSchema } from "@core/schemas";
import { decodeOpenAIVideoRequestToIR } from "@pipeline/surfaces/video-codec";
import { selectVideoProviderOptions } from "@core/video-provider-options";
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
			reservationId: "video_hold:req_atlas_video_test",
			held: false,
			amountNanos: 0,
			status: "skip_zero_cost",
		}
	)),
}));

vi.mock("@core/video-jobs", () => ({
	saveVideoJobMeta: (...args: unknown[]) => {
		if (state.saveVideoJobMetaError && saveVideoJobMetaMock.mock.calls.length > 0) throw state.saveVideoJobMetaError;
		return saveVideoJobMetaMock(...args);
	},
	setVideoJobStatus: vi.fn(async () => undefined),
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

function buildArgs(ir: IRVideoGenerationRequest, providerId = "atlascloud"): ExecutorExecuteArgs {
	return {
		ir,
		requestId: "req_atlas_video_test",
		workspaceId: "team_test",
		providerId,
		endpoint: "video.generation",
		protocol: "openai",
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

describe("atlascloud video executor", () => {
	it("uses the submitted Seedance audio and inferred ratio in billing metadata", async () => {
		let body: any;
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/api/v1/model/generateVideo"),
			response: jsonResponse({ data: { id: "defaults", status: "processing" } }),
			onRequest: (call) => { body = call.bodyJson; },
		}]);
		try {
			await execute(buildArgs({ model: "bytedance/seedance-2.5/text-to-video", prompt: "test", durationSeconds: 6, size: "1280x720" } as any));
			expect(body).toMatchObject({ generate_audio: true, ratio: "16:9" });
			expect(saveVideoJobMetaMock).toHaveBeenCalledWith("team_test", "req_atlas_video_test", expect.objectContaining({ audio: true, aspectRatio: "16:9" }), "defaults", "in_progress");
		} finally { mock.restore(); }
	});
	it("passes Seedance 2.5 multimodal references through the public schema and IR", async () => {
		let body: any;
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/api/v1/model/generateVideo"),
			response: jsonResponse({ data: { id: "seedance_refs", status: "processing" } }),
			onRequest: (call) => { body = call.bodyJson; },
		}]);
		try {
			const parsed = VideoGenerationSchema.parse({
				model: "bytedance/seedance-2.5/reference-to-video", prompt: "@Image1 dances to @Audio1", duration: 6,
				resolution: "720p", aspect_ratio: "16:9", generate_audio: false,
				input_video_duration: 4, input_audio_duration: 5,
				input_references: [
					{ type: "image_url", role: "reference", image_url: { url: "https://example.com/character.png" } },
					{ type: "video_url", media_url: { url: "https://example.com/motion.mp4" } },
					{ type: "audio_url", media_url: { url: "https://example.com/music.mp3" } },
				],
				provider_options: { atlascloud: { watermark: false }, byteplus: { camera_fixed: true } },
			});
			await execute(buildArgs(selectVideoProviderOptions(decodeOpenAIVideoRequestToIR(parsed), "atlascloud")));
			expect(body).toMatchObject({
				resolution: "720p", ratio: "16:9", duration: 6, generate_audio: false, watermark: false,
				reference_images: ["https://example.com/character.png"],
				reference_videos: ["https://example.com/motion.mp4"],
				reference_audios: ["https://example.com/music.mp3"],
			});
			expect(body.camera_fixed).toBeUndefined();
			expect(body.video).toBeUndefined();
		} finally { mock.restore(); }
	});
	beforeEach(() => {
		saveVideoJobMetaMock.mockClear();
		state.reservationResult = null;
		state.releaseCalls = [];
		state.saveVideoJobMetaError = null;
	});

	it("submits async atlas task and stores prediction id", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url.endsWith("/api/v1/model/generateVideo"),
				response: jsonResponse({
					data: {
						id: "atlas_pred_123",
						status: "processing",
					},
				}),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
			},
		]);

		const result = await execute(buildArgs({
			model: "bytedance/seedance-2.0-pro",
			prompt: "A cinematic drone shot over Icelandic cliffs",
			duration: 6,
			size: "1280x720",
		}));

		mock.restore();

		expect(capturedBody?.model).toBe("bytedance/seedance-2.0-pro");
		expect(capturedBody?.resolution).toBe("720p");
		expect(capturedBody?.ratio).toBe("16:9");
		expect(capturedBody?.size).toBeUndefined();
		expect(capturedBody?.prompt).toBe("A cinematic drone shot over Icelandic cliffs");
		expect((result as any).ir?.nativeId).toContain("atlsvid_");
		expect(saveVideoJobMetaMock).toHaveBeenCalledWith(
			"team_test",
			"req_atlas_video_test",
			expect.objectContaining({
				provider: "atlascloud",
				providerTaskId: "atlas_pred_123",
			}),
			"atlas_pred_123",
			"in_progress",
		);
	});

	it("fails the gateway response when AtlasCloud video metadata cannot be persisted", async () => {
		state.reservationResult = {
			reservationId: "video_hold:req_atlas_video_test",
			held: true,
			amountNanos: 123_000_000,
			status: "held",
		};
		state.saveVideoJobMetaError = new Error("async operation store unavailable");
		const mock = installFetchMock([
			{
				match: (url) => url.endsWith("/api/v1/model/generateVideo"),
				response: jsonResponse({
					data: {
						id: "atlas_pred_meta_failed",
						status: "processing",
					},
				}),
			},
		]);

		const result = await execute(buildArgs({
			model: "bytedance/seedance-2.0-pro",
			prompt: "An AtlasCloud metadata persistence failure",
			duration: 6,
			size: "1280x720",
		}));

		mock.restore();

		expect(result.upstream?.status).toBe(502);
		expect(await result.upstream?.clone().json()).toMatchObject({
			error: {
				type: "async_job_persistence_failed",
				native_video_id: expect.stringContaining("atlsvid_"),
				reservation_id: "video_hold:req_atlas_video_test",
				reservation_status: "held",
			},
		});
		expect(result.ir).toBeUndefined();
		expect(saveVideoJobMetaMock).toHaveBeenCalledTimes(1);
		expect(state.releaseCalls).toEqual([]);
	});

	it("retains the journal and hold when AtlasCloud returns success without a prediction id", async () => {
		state.reservationResult = {
			reservationId: "video_hold:req_atlas_video_test",
			held: true,
			amountNanos: 123_000_000,
			status: "held",
		};
		const mock = installFetchMock([
			{
				match: (url) => url.endsWith("/api/v1/model/generateVideo"),
				response: jsonResponse({
					data: {
						status: "processing",
					},
				}),
			},
		]);

		const result = await execute(buildArgs({
			model: "bytedance/seedance-2.0-pro",
			prompt: "An AtlasCloud response without a prediction id",
			duration: 6,
			size: "1280x720",
		}));

		mock.restore();

		expect(result.upstream?.status).toBe(502);
		expect(await result.upstream?.clone().json()).toMatchObject({
			error: {
				type: "invalid_upstream_response",
			},
		});
		expect(result.ir).toBeUndefined();
		expect(saveVideoJobMetaMock).toHaveBeenCalledTimes(1);
		expect(state.releaseCalls).toEqual([]);
	});

	it("does not submit upstream when reservation pricing dimensions are missing", async () => {
		state.reservationResult = {
			reservationId: "video_hold:req_atlas_video_test",
			held: false,
			amountNanos: 0,
			status: "skip_missing_seconds_or_pricing",
		};
		const mock = installFetchMock([
			{
				match: (url) => url.endsWith("/api/v1/model/generateVideo"),
				response: jsonResponse({
					data: {
						id: "atlas_should_not_submit",
						status: "processing",
					},
				}),
			},
		]);

		const result = await execute(buildArgs({
			model: "bytedance/seedance-2.0-pro",
			prompt: "An AtlasCloud request without duration pricing dimensions",
			size: "1280x720",
		}));

		mock.restore();

		expect(result.upstream?.status).toBe(400);
		expect(await result.upstream?.clone().json()).toMatchObject({
			error: {
				type: "missing_billing_dimensions",
			},
		});
		expect(result.ir).toBeUndefined();
		expect(saveVideoJobMetaMock).not.toHaveBeenCalled();
		expect(state.releaseCalls).toEqual([]);
		expect(mock.calls).toEqual([]);
	});
});
