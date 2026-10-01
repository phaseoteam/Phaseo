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
	saveVideoJobMetaCalls: [] as Array<unknown[]>,
	saveVideoJobMetaError: null as Error | null,
}));

vi.mock("@core/video-reservations", () => ({
	isInsufficientVideoReservationStatus: (status: unknown) =>
		status === "insufficient_funds" || status === "insufficient_balance",
	reserveVideoGenerationCredits: vi.fn(async () => (
		state.reservationResult ?? {
			reservationId: "video_hold:req_minimax_video_test",
			held: false,
			amountNanos: 0,
			status: "skip_zero_cost",
		}
	)),
}));

vi.mock("@core/video-jobs", () => ({
	saveVideoJobMeta: (...args: unknown[]) => {
		state.saveVideoJobMetaCalls.push(args);
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

function buildArgs(
	ir: IRVideoGenerationRequest,
	providerModelSlug: string | null = null,
): ExecutorExecuteArgs {
	return {
		ir,
		requestId: "req_minimax_video_test",
		workspaceId: "team_test",
		providerId: "minimax",
		endpoint: "video.generation",
		protocol: "minimax.video",
		capability: "video.generate",
		providerModelSlug,
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

describe("minimax video executor", () => {
	it("normalizes public lowercase resolution before native submission", async () => {
		const mock = installFetchMock([{ match: (url) => url.includes("/video_generation"), response: jsonResponse({ task_id: "task-512", base_resp: { status_code: 0 } }) }]);
		try {
			await execute(buildArgs({ model: "minimax/hailuo-02", prompt: "A sphere", duration: 6, size: "512p", inputReference: "https://example.com/image.png" }, "MiniMax-Hailuo-02"));
			expect(mock.calls[0]?.bodyJson.resolution).toBe("512P");
		} finally { mock.restore(); }
	});
	it("rejects 512P text-to-video before reserving or submitting", async () => {
		const mock = installFetchMock([]);
		try {
			const result = await execute(buildArgs({ model: "minimax/hailuo-02", prompt: "A sphere", duration: 6, size: "512p" }, "MiniMax-Hailuo-02"));
			expect(result.upstream?.status).toBe(400);
			expect(mock.calls).toHaveLength(0);
			expect(state.saveVideoJobMetaCalls).toHaveLength(0);
		} finally { mock.restore(); }
	});
	it.each([
		{ model: "MiniMax-H3", duration: 3 },
		{ model: "MiniMax-H3-Max", duration: 4 },
		{ model: "MiniMax-H3-Max", size: "2K" },
		{ model: "MiniMax-H3", duration: 6.5 },
		{ model: "MiniMax-H3", sampleCount: 2 },
		{ model: "MiniMax-H3", aspectRatio: "adaptive" },
		{ model: "MiniMax-H3-Max", inputReferences: [{ type: "image", role: "reference", url: "https://example.com/ref.jpg" }] },
		{ model: "MiniMax-H3", inputReference: "https://example.com/first.jpg", inputReferences: [{ type: "image", role: "reference", url: "https://example.com/ref.jpg" }] },
		{ model: "MiniMax-H3", inputReferences: [{ type: "video", role: "reference", url: "https://example.com/ref.mp4" }] },
	] as IRVideoGenerationRequest[])("rejects unsupported H3 combinations before submitting: %j", async (options) => {
		const mock = installFetchMock([]);
		try {
			const result = await execute(buildArgs({ prompt: "A simple sphere", ...options }, options.model));
			expect(result.upstream?.status).toBe(400);
			expect(mock.calls).toHaveLength(0);
			expect(saveVideoJobMetaMock).not.toHaveBeenCalled();
		} finally { mock.restore(); }
	});
	beforeEach(() => {
		saveVideoJobMetaMock.mockClear();
		state.reservationResult = null;
		state.releaseCalls = [];
		state.saveVideoJobMetaCalls = [];
		state.saveVideoJobMetaError = null;
	});

	it("stores upstream minimax task id for later polling", async () => {
		const mock = installFetchMock([
			{
				match: (url) => url.endsWith("/v1/video_generation"),
				response: jsonResponse({ task_id: "task_123", status: "queued" }),
			},
		]);

		const result = await execute(
			buildArgs(
				{
					model: "minimax/hailuo-2.3",
					prompt: "A lantern floating on a river at dusk",
					size: "1080P",
					duration: 6,
					inputReference: "https://example.com/first-frame.png",
				},
				"MiniMax-Hailuo-2.3",
			),
		);

		mock.restore();

		expect(result.kind).toBe("completed");
		expect(result.ir && (result.ir as any).nativeId).toContain("mmxvid_");
		expect(saveVideoJobMetaMock).toHaveBeenCalledWith(
			"team_test",
			"req_minimax_video_test",
			expect.objectContaining({
				provider: "minimax",
				providerTaskId: "task_123",
			}),
			"task_123",
			"queued",
		);
	});

	it("uses MiniMax V2 content requests for H3 text-to-video", async () => {
		let capturedUrl = "";
		let capturedBody: any = null;
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v2/video_generation"),
			response: jsonResponse({ task_id: "task_h3", status: "queued" }),
			onRequest: (call) => {
				capturedUrl = call.url;
				capturedBody = call.bodyJson;
			},
		}]);

		const result = await execute(buildArgs({
			model: "minimax/h3",
			prompt: "A cinematic sunrise over the ocean",
			duration: 5,
			resolution: "2K",
			aspectRatio: "16:9",
		}, "MiniMax-H3"));

		mock.restore();
		expect(result.upstream?.status).toBe(200);
		expect(capturedUrl).toContain("/v2/video_generation");
		expect(capturedBody).toMatchObject({
			model: "MiniMax-H3",
			resolution: "2K",
			duration: 5,
			ratio: "16:9",
			content: [{ type: "text", text: "A cinematic sunrise over the ocean" }],
		});
	});

	it("maps H3 Max first and last frames into V2 content", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v2/video_generation"),
			response: jsonResponse({ task_id: "task_h3_max", status: "queued" }),
			onRequest: (call) => { capturedBody = call.bodyJson; },
		}]);

		const result = await execute(buildArgs({
			model: "minimax/h3-max",
			prompt: "A dancer moves through a neon city",
			duration: 8,
			size: "480P",
			inputReferences: [
				{ type: "image", role: "first_frame", url: "https://example.com/first.jpg" },
				{ type: "image", role: "last_frame", url: "https://example.com/last.jpg" },
			],
		}, "MiniMax-H3-Max"));

		mock.restore();
		expect(result.upstream?.status).toBe(200);
		expect(capturedBody).toMatchObject({
			model: "MiniMax-H3-Max",
			resolution: "480P",
			duration: 8,
			ratio: "adaptive",
			content: [
				{ type: "text", text: "A dancer moves through a neon city" },
				{ type: "image_url", image_url: { url: "https://example.com/first.jpg" }, role: "first_frame" },
				{ type: "image_url", image_url: { url: "https://example.com/last.jpg" }, role: "last_frame" },
			],
		});
	});

	it("rejects unsupported prompt options for MiniMax V2", async () => {
		const mock = installFetchMock([]);
		const result = await execute(buildArgs({
			model: "minimax/h3",
			prompt: "A cinematic sunrise over the ocean",
			enhancePrompt: true,
			providerParams: { fast_pretreatment: true },
		}, "MiniMax-H3"));

		mock.restore();
		expect(result.upstream?.status).toBe(400);
		expect(await result.upstream?.json()).toMatchObject({
			error: {
				type: "unsupported_option",
				message: expect.stringContaining("prompt_optimizer or fast_pretreatment"),
			},
		});
	});

	it("fails the gateway response when MiniMax video metadata cannot be persisted", async () => {
		state.reservationResult = {
			reservationId: "video_hold:req_minimax_video_test",
			held: true,
			amountNanos: 123_000_000,
			status: "held",
		};
		state.saveVideoJobMetaError = new Error("async operation store unavailable");
		const mock = installFetchMock([
			{
				match: (url) => url.endsWith("/v1/video_generation"),
				response: jsonResponse({ task_id: "task_meta_failed", status: "queued" }),
			},
		]);

		const result = await execute(
			buildArgs(
				{
					model: "minimax/hailuo-2.3",
					prompt: "A MiniMax metadata persistence failure",
					size: "1080P",
					duration: 6,
					inputReference: "https://example.com/first-frame.png",
				},
				"MiniMax-Hailuo-2.3",
			),
		);

		mock.restore();

		expect(result.upstream?.status).toBe(502);
		expect(await result.upstream?.clone().json()).toMatchObject({
			error: {
				type: "async_job_persistence_failed",
				native_video_id: expect.stringContaining("mmxvid_"),
				reservation_id: "video_hold:req_minimax_video_test",
				reservation_status: "held",
			},
		});
		expect(result.ir).toBeUndefined();
		expect(saveVideoJobMetaMock).toHaveBeenCalledTimes(1);
		expect(state.saveVideoJobMetaCalls).toHaveLength(2);
		expect(state.releaseCalls).toEqual([]);
	});

	it("rejects Hailuo 2.3 Fast without an input reference", async () => {
		const result = await execute(
			buildArgs(
				{
					model: "minimax/hailuo-2.3-fast",
					prompt: "A cat jumping over a puddle",
					size: "768P",
					duration: 6,
				},
				"MiniMax-Hailuo-2.3-Fast",
			),
		);

		expect(result.upstream?.status).toBe(400);
		const payload = await result.upstream?.json();
		expect(payload?.error?.type).toBe("input_reference_required");
	});

	it("maps video size to MiniMax resolution and omits size", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url.endsWith("/v1/video_generation"),
				response: jsonResponse({ task_id: "task_123", status: "queued" }),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
			},
		]);

		const result = await execute(
			buildArgs(
				{
					model: "minimax/hailuo-2.3",
					prompt: "A paper boat drifting through a moonlit canal",
					size: "1080P",
					duration: 6,
					inputReference: "https://example.com/first-frame.png",
				},
				"MiniMax-Hailuo-2.3",
			),
		);

		mock.restore();

		expect(result.upstream?.status).toBe(200);
		expect(capturedBody?.model).toBe("MiniMax-Hailuo-2.3");
		expect(capturedBody?.resolution).toBe("1080P");
		expect(capturedBody?.size).toBeUndefined();
		expect(capturedBody?.first_frame_image).toBe("https://example.com/first-frame.png");
	});

	it("applies MiniMax's documented 6-second and 768P Hailuo defaults", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1/video_generation"),
			response: jsonResponse({ task_id: "task_defaults", base_resp: { status_code: 0 } }),
			onRequest: (call) => { capturedBody = call.bodyJson; },
		}]);

		const result = await execute(buildArgs({
			model: "minimax/hailuo-2.3",
			prompt: "A sunrise above a quiet bay",
		}, "MiniMax-Hailuo-2.3"));

		mock.restore();
		expect(result.upstream?.status).toBe(200);
		expect(capturedBody).toMatchObject({ duration: 6, resolution: "768P" });
	});

	it("maps MiniMax prompt optimization, fast pretreatment, and last-frame inputs", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1/video_generation"),
			response: jsonResponse({ task_id: "task_frames", base_resp: { status_code: 0 } }),
			onRequest: (call) => { capturedBody = call.bodyJson; },
		}]);

		const result = await execute(buildArgs({
			model: "minimax/hailuo-02",
			prompt: "A flower opens between the first and last frames",
			duration: 6,
			size: "1080P",
			inputReference: { image_url: "https://example.com/first.jpg" },
			lastFrame: "https://example.com/last.jpg",
			enhancePrompt: false,
			providerParams: { fast_pretreatment: true },
			seed: 7,
			quality: "high",
		}, "MiniMax-Hailuo-02"));

		mock.restore();
		expect(result.upstream?.status).toBe(200);
		expect(capturedBody).toMatchObject({
			first_frame_image: "https://example.com/first.jpg",
			last_frame_image: "https://example.com/last.jpg",
			prompt_optimizer: false,
			fast_pretreatment: true,
		});
		expect(capturedBody.seed).toBeUndefined();
		expect(capturedBody.quality).toBeUndefined();
	});

	it("maps reference images to the documented S2V subject_reference shape", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1/video_generation"),
			response: jsonResponse({ task_id: "task_subject", base_resp: { status_code: 0 } }),
			onRequest: (call) => { capturedBody = call.bodyJson; },
		}]);

		const result = await execute(buildArgs({
			model: "minimax/s2v-01",
			prompt: "The character waves",
			duration: 6,
			size: "1080P",
			inputReferences: [{ type: "image", role: "reference", referenceType: "character", url: "https://example.com/person.webp" }],
		}, "S2V-01"));

		mock.restore();
		expect(result.upstream?.status).toBe(200);
		expect(capturedBody.subject_reference).toEqual([{
			type: "character",
			image: ["https://example.com/person.webp"],
		}]);
	});

	it("surfaces HTTP-200 MiniMax application errors and releases reservations", async () => {
		state.reservationResult = {
			reservationId: "video_hold:req_minimax_video_test",
			held: true,
			amountNanos: 123_000_000,
			status: "held",
		};
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1/video_generation"),
			response: jsonResponse({ base_resp: { status_code: 1008, status_msg: "insufficient balance" } }),
		}]);

		const result = await execute(buildArgs({
			model: "minimax/hailuo-2.3",
			prompt: "A fox in snow",
			duration: 6,
			size: "768P",
		}, "MiniMax-Hailuo-2.3"));

		mock.restore();
		expect(result.upstream?.status).toBe(402);
		expect(await result.upstream?.clone().json()).toMatchObject({
			error: { type: "minimax_api_error", code: 1008, message: "insufficient balance" },
		});
		expect(state.releaseCalls).toHaveLength(1);
	});

	it("retains a held reservation when MiniMax returns success without a task id", async () => {
		state.reservationResult = {
			reservationId: "video_hold:req_minimax_video_test",
			held: true,
			amountNanos: 123_000_000,
			status: "held",
		};
		const mock = installFetchMock([
			{
				match: (url) => url.endsWith("/v1/video_generation"),
				response: jsonResponse({ status: "queued" }),
			},
		]);

		const result = await execute(
			buildArgs(
				{
					model: "minimax/hailuo-2.3",
					prompt: "A MiniMax response without task id",
					size: "1080P",
					duration: 6,
					inputReference: "https://example.com/first-frame.png",
				},
				"MiniMax-Hailuo-2.3",
			),
		);

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
			reservationId: "video_hold:req_minimax_video_test",
			held: false,
			amountNanos: 0,
			status: "skip_missing_seconds_or_pricing",
		};
		const mock = installFetchMock([
			{
				match: (url) => url.endsWith("/v1/video_generation"),
				response: jsonResponse({ task_id: "task_should_not_submit", status: "queued" }),
			},
		]);

		const result = await execute(
			buildArgs(
				{
					model: "minimax/hailuo-2.3",
					prompt: "A MiniMax request without duration pricing dimensions",
					size: "1080P",
					inputReference: "https://example.com/first-frame.png",
				},
				"MiniMax-Hailuo-2.3",
			),
		);

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
