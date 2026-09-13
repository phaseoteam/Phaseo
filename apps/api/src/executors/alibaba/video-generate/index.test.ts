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
			reservationId: "video_hold:req_wan_video_test",
			held: false,
			amountNanos: 0,
			status: "skip_zero_cost",
		}
	)),
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

function buildArgs(ir: IRVideoGenerationRequest, providerId = "alibaba"): ExecutorExecuteArgs {
	return {
		ir,
		requestId: "req_wan_video_test",
		workspaceId: "team_test",
		providerId,
		endpoint: "video.generation",
		protocol: "alibaba.video",
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

describe("alibaba wan video executor", () => {
	beforeEach(() => {
		saveVideoJobMetaMock.mockClear();
		state.reservationResult = null;
		state.releaseCalls = [];
		state.saveVideoJobMetaError = null;
	});

	it("submits async wan task and stores upstream task id", async () => {
		let capturedBody: any = null;
		let capturedHeaders: Record<string, string> = {};
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/api/v1/services/aigc/video-generation/video-synthesis"),
				response: jsonResponse({
					output: {
						task_id: "wan_task_123",
						task_status: "PENDING",
					},
				}),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
					capturedHeaders = call.headers;
				},
			},
		]);

		const result = await execute(buildArgs({
			model: "qwen/wan2.2-t2v-plus",
			prompt: "A calm mountain lake at sunrise",
			duration: 6,
			size: "1280x720",
		}));

		mock.restore();

		expect(capturedHeaders["X-DashScope-Async"]).toBe("enable");
		expect(capturedBody?.model).toBe("wan2.2-t2v-plus");
		expect(capturedBody?.input?.prompt).toBe("A calm mountain lake at sunrise");
		expect(capturedBody?.parameters?.size).toBe("1280x720");
		expect((result as any).ir?.nativeId).toContain("dscope_");
		expect(saveVideoJobMetaMock).toHaveBeenCalledWith(
			"team_test",
			"req_wan_video_test",
			expect.objectContaining({
				provider: "alibaba",
				providerTaskId: "wan_task_123",
			}),
			"wan_task_123",
			"queued",
		);
	});

	it("maps Wan 2.7 media inputs and resolution to the current protocol", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/api/v1/services/aigc/video-generation/video-synthesis"),
				response: jsonResponse({ output: { task_id: "wan27_task_123", task_status: "PENDING" } }),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
			},
		]);

		const result = await execute(buildArgs({
			model: "qwen/wan2.7-i2v-2026-04-25",
			prompt: "Continue from the first frame and finish on the last frame",
			duration: 10,
			resolution: "1280x720",
			aspectRatio: "16:9",
			inputReferences: [
				{ type: "image", role: "first_frame", url: "https://example.com/first.png" },
				{ type: "image", role: "last_frame", url: "https://example.com/last.png" },
				{ type: "audio", role: "reference", url: "https://example.com/track.mp3" },
			],
		}));

		mock.restore();

		expect(result.upstream?.status).toBe(200);
		expect(capturedBody).toEqual({
			model: "wan2.7-i2v-2026-04-25",
			input: {
				prompt: "Continue from the first frame and finish on the last frame",
				audio_url: "https://example.com/track.mp3",
				media: [
					{ type: "first_frame", url: "https://example.com/first.png" },
					{ type: "last_frame", url: "https://example.com/last.png" },
				],
			},
			parameters: { duration: 10, resolution: "720P", ratio: "16:9" },
		});
		expect(capturedBody.parameters).not.toHaveProperty("size");
		expect(saveVideoJobMetaMock).toHaveBeenCalledWith(
			"team_test",
			"req_wan_video_test",
			expect.objectContaining({ providerTaskId: "wan27_task_123", inputImageCount: 2 }),
			"wan27_task_123",
			"queued",
		);
	});

	it("maps Wan 3.0 parameters to the native async API", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/api/v1/services/aigc/video-generation/video-synthesis"),
				response: jsonResponse({ output: { task_id: "wan30_task_123", task_status: "PENDING" } }),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
			},
		]);

		const result = await execute(buildArgs({
			model: "qwen/wan3.0-video",
			prompt: "A cinematic sunrise over a quiet ocean",
			duration: 8,
			resolution: "720p",
			aspectRatio: "16:9",
			generateAudio: false,
			enhancePrompt: false,
			providerParams: { watermark: true },
		}));

		mock.restore();

		expect(result.upstream?.status).toBe(200);
		expect(capturedBody).toEqual({
			model: "wan3.0-video",
			input: { prompt: "A cinematic sunrise over a quiet ocean" },
			parameters: {
				resolution: "720P",
				ratio: "16:9",
				duration: 8,
				audio: false,
				prompt_extend: false,
				watermark: true,
			},
		});
		expect(saveVideoJobMetaMock).toHaveBeenCalledWith(
			"team_test",
			"req_wan_video_test",
			expect.objectContaining({ model: "qwen/wan3.0-video", seconds: 8, resolution: "720P" }),
			"wan30_task_123",
			"queued",
		);
	});

	it("maps Wan 3.0 Prime multimodal references and bills input video duration", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/api/v1/services/aigc/video-generation/video-synthesis"),
				response: jsonResponse({ output: { task_id: "wan30_prime_task_123", task_status: "PENDING" } }),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
			},
		]);

		await execute(buildArgs({
			model: "qwen/wan3.0-video-prime",
			prompt: "Use Image 1 and Video 1 to create a product launch scene with Audio 1",
			duration: 10,
			resolution: "1080P",
			inputVideoDurationSeconds: 8,
			inputReferences: [
				{ type: "image", role: "reference", url: "https://example.com/product.png" },
				{ type: "video", role: "reference", url: "https://example.com/motion.mp4" },
				{ type: "audio", role: "reference", url: "https://example.com/music.mp3" },
			],
		}));

		mock.restore();

		expect(capturedBody).toEqual({
			model: "wan3.0-video-prime",
			input: {
				prompt: "Use Image 1 and Video 1 to create a product launch scene with Audio 1",
				media: [
					{ type: "reference_image", url: "https://example.com/product.png" },
					{ type: "reference_video", url: "https://example.com/motion.mp4" },
					{ type: "reference_audio", url: "https://example.com/music.mp3" },
				],
			},
			parameters: { resolution: "1080P", duration: 10 },
		});
	});

	it("rejects Wan 3.0 reference video without its billing duration", async () => {
		const mock = installFetchMock([]);

		const result = await execute(buildArgs({
			model: "qwen/wan3.0-video",
			prompt: "Edit the reference video",
			duration: 10,
			inputReferences: [
				{ type: "video", role: "reference", url: "https://example.com/source.mp4" },
			],
		}));

		mock.restore();

		expect(result.upstream?.status).toBe(400);
		expect(await result.upstream?.clone().json()).toMatchObject({
			error: { type: "invalid_request", message: expect.stringContaining("input_video_duration") },
		});
		expect(mock.calls).toEqual([]);
	});

	it("maps the HappyHorse 1.1 family to text-to-video with provider defaults", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/api/v1/services/aigc/video-generation/video-synthesis"),
				response: jsonResponse({ output: { task_id: "happyhorse_t2v_task", task_status: "PENDING" } }),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
			},
		]);

		const result = await execute(buildArgs({
			model: "alibaba/happyhorse-1.1",
			prompt: "A paper city comes alive at night",
		}));

		mock.restore();

		expect(result.upstream?.status).toBe(200);
		expect((result as any).ir?.model).toBe("alibaba/happyhorse-1.1");
		expect(capturedBody).toEqual({
			model: "happyhorse-1.1-t2v",
			input: { prompt: "A paper city comes alive at night" },
			parameters: { duration: 5, resolution: "1080P" },
		});
		expect(saveVideoJobMetaMock).toHaveBeenCalledWith(
			"team_test",
			"req_wan_video_test",
			expect.objectContaining({
				model: "alibaba/happyhorse-1.1",
				seconds: 5,
				resolution: "1080P",
			}),
			"happyhorse_t2v_task",
			"queued",
		);
	});

	it("maps HappyHorse first-frame and reference-image modes from normalized IR roles", async () => {
		const capturedBodies: any[] = [];
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/api/v1/services/aigc/video-generation/video-synthesis"),
				response: jsonResponse({ output: { task_id: "happyhorse_i2v_task", task_status: "PENDING" } }),
				onRequest: (call) => capturedBodies.push(call.bodyJson),
			},
			{
				match: (url) => url.includes("/api/v1/services/aigc/video-generation/video-synthesis"),
				response: jsonResponse({ output: { task_id: "happyhorse_r2v_task", task_status: "PENDING" } }),
				onRequest: (call) => capturedBodies.push(call.bodyJson),
			},
		]);

		await execute(buildArgs({
			model: "alibaba/happyhorse-1.1",
			prompt: "The cat runs through the grass",
			duration: 8,
			resolution: "1280x720",
			inputReferences: [
				{ type: "image", role: "first_frame", url: "https://example.com/cat.png" },
			],
		}));
		await execute(buildArgs({
			model: "alibaba/happyhorse-1.1",
			prompt: "[Image 1] carries the prop from [Image 2]",
			duration: 6,
			aspectRatio: "9:16",
			inputReferences: [
				{ type: "image", role: "reference", url: "https://example.com/character.png" },
				{ type: "image", role: "reference", url: "https://example.com/prop.png" },
			],
		}));

		mock.restore();

		expect(capturedBodies).toEqual([
			{
				model: "happyhorse-1.1-i2v",
				input: {
					prompt: "The cat runs through the grass",
					media: [{ type: "first_frame", url: "https://example.com/cat.png" }],
				},
				parameters: { duration: 8, resolution: "720P" },
			},
			{
				model: "happyhorse-1.1-r2v",
				input: {
					prompt: "[Image 1] carries the prop from [Image 2]",
					media: [
						{ type: "reference_image", url: "https://example.com/character.png" },
						{ type: "reference_image", url: "https://example.com/prop.png" },
					],
				},
				parameters: { duration: 6, resolution: "1080P", ratio: "9:16" },
			},
		]);
	});

	it("maps HappyHorse 1.0 source video to video editing without sending duration upstream", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/api/v1/services/aigc/video-generation/video-synthesis"),
				response: jsonResponse({ output: { task_id: "happyhorse_edit_task", task_status: "PENDING" } }),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
			},
		]);

		const result = await execute(buildArgs({
			model: "alibaba/happyhorse-1.0",
			prompt: "Put the jacket from the image on the subject",
			inputVideoDurationSeconds: 12.5,
			resolution: "720P",
			providerParams: { watermark: false, audio_setting: "origin" },
			inputReferences: [
				{ type: "video", role: "source", url: "https://example.com/source.mp4" },
				{ type: "image", role: "reference", url: "https://example.com/jacket.webp" },
			],
		}));

		mock.restore();

		expect(result.upstream?.status).toBe(200);
		expect(capturedBody).toEqual({
			model: "happyhorse-1.0-video-edit",
			input: {
				prompt: "Put the jacket from the image on the subject",
				media: [
					{ type: "video", url: "https://example.com/source.mp4" },
					{ type: "reference_image", url: "https://example.com/jacket.webp" },
				],
			},
			parameters: { resolution: "720P", watermark: false, audio_setting: "origin" },
		});
		expect(capturedBody.parameters).not.toHaveProperty("duration");
		expect(saveVideoJobMetaMock).toHaveBeenCalledWith(
			"team_test",
			"req_wan_video_test",
			expect.objectContaining({ inputImageCount: 1, inputVideoCount: 1, inputVideoSeconds: 12.5, seconds: 12 }),
			"happyhorse_edit_task",
			"queued",
		);
	});

	it("rejects unsupported HappyHorse combinations before provider submission", async () => {
		const mock = installFetchMock([]);

		const result = await execute(buildArgs({
			model: "alibaba/happyhorse-1.1",
			prompt: "Edit this video",
			duration: 5,
			inputReferences: [
				{ type: "video", role: "source", url: "https://example.com/source.mp4" },
			],
		}));

		mock.restore();

		expect(result.upstream?.status).toBe(400);
		expect(await result.upstream?.clone().json()).toMatchObject({
			error: {
				type: "invalid_request",
				message: expect.stringContaining("HappyHorse 1.1 does not support video editing"),
			},
		});
		expect(mock.calls).toEqual([]);
		expect(saveVideoJobMetaMock).not.toHaveBeenCalled();
	});

	it("fails the gateway response when Alibaba video metadata cannot be persisted", async () => {
		state.reservationResult = {
			reservationId: "video_hold:req_wan_video_test",
			held: true,
			amountNanos: 123_000_000,
			status: "held",
		};
		state.saveVideoJobMetaError = new Error("async operation store unavailable");
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/api/v1/services/aigc/video-generation/video-synthesis"),
				response: jsonResponse({
					output: {
						task_id: "wan_task_meta_failed",
						task_status: "PENDING",
					},
				}),
			},
		]);

		const result = await execute(buildArgs({
			model: "qwen/wan2.2-t2v-plus",
			prompt: "A Wan metadata persistence failure",
			duration: 6,
			size: "1280x720",
		}));

		mock.restore();

		expect(result.upstream?.status).toBe(502);
		expect(await result.upstream?.clone().json()).toMatchObject({
			error: {
				type: "async_job_persistence_failed",
				native_video_id: expect.stringContaining("dscope_"),
				reservation_id: "video_hold:req_wan_video_test",
				reservation_status: "held",
			},
		});
		expect(result.ir).toBeUndefined();
		expect(saveVideoJobMetaMock).toHaveBeenCalledTimes(1);
		expect(state.releaseCalls).toEqual([]);
	});

	it("retains a held reservation when Alibaba returns success without a task id", async () => {
		state.reservationResult = {
			reservationId: "video_hold:req_wan_video_test",
			held: true,
			amountNanos: 123_000_000,
			status: "held",
		};
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/api/v1/services/aigc/video-generation/video-synthesis"),
				response: jsonResponse({
					output: {
						task_status: "PENDING",
					},
				}),
			},
		]);

		const result = await execute(buildArgs({
			model: "qwen/wan2.2-t2v-plus",
			prompt: "A Wan response without task id",
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
			reservationId: "video_hold:req_wan_video_test",
			held: false,
			amountNanos: 0,
			status: "skip_missing_seconds_or_pricing",
		};
		const mock = installFetchMock([
			{
				match: (url) => url.includes("/api/v1/services/aigc/video-generation/video-synthesis"),
				response: jsonResponse({
					output: {
						task_id: "wan_should_not_submit",
						task_status: "PENDING",
					},
				}),
			},
		]);

		const result = await execute(buildArgs({
			model: "qwen/wan2.2-t2v-plus",
			prompt: "A Wan request without duration pricing dimensions",
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
