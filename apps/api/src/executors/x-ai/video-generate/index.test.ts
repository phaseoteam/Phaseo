import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { IRVideoGenerationRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { execute, __xAiVideoGenerateTestUtils } from "./index";
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
			reservationId: "video_hold:req_xai_video_test",
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

function buildArgs(ir: IRVideoGenerationRequest): ExecutorExecuteArgs {
	return {
		ir,
		requestId: "req_xai_video_test",
		workspaceId: "team_test",
		providerId: "x-ai",
		endpoint: "video.generation",
		protocol: "xai.video",
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

describe("x-ai video executor", () => {
	beforeEach(() => {
		saveVideoJobMetaMock.mockClear();
		state.reservationResult = null;
		state.releaseCalls = [];
		state.saveVideoJobMetaError = null;
	});

	it("normalizes Grok Imagine Video aliases", () => {
		expect(__xAiVideoGenerateTestUtils.normalizeXAiVideoModel("x-ai/grok-imagine-video")).toBe(
			"grok-imagine-video",
		);
		expect(__xAiVideoGenerateTestUtils.normalizeXAiVideoModel("grok-imagine-video-latest")).toBe(
			"grok-imagine-video",
		);
		expect(__xAiVideoGenerateTestUtils.normalizeXAiVideoModel("grok-video")).toBe("grok-video");
	});

	it("submits canonical imagine model id to upstream", async () => {
		let capturedBody: any = null;
		let capturedUrl = "";
		const mock = installFetchMock([
			{
				match: (url) => url.endsWith("/videos/generations"),
				response: jsonResponse({
					id: "vid_123",
					status: "queued",
				}),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
					capturedUrl = call.url;
				},
			},
		]);

		const result = await execute(buildArgs({
			model: "x-ai/grok-imagine-video-latest",
			prompt: "A neon city timelapse",
			duration: 10,
			resolution: "1280x720",
			aspectRatio: "16:9",
			quality: "high",
		}));

		mock.restore();

		expect(result.upstream?.status).toBe(200);
		expect(capturedUrl).toContain("/videos/generations");
		expect(capturedBody?.model).toBe("grok-imagine-video");
		expect(capturedBody).toMatchObject({ duration: 10, resolution: "720p", aspect_ratio: "16:9" });
		expect(capturedBody).not.toHaveProperty("size");
		expect(capturedBody).not.toHaveProperty("quality");
		expect((result as any).ir?.model).toBe("spacex-ai/grok-imagine-video");
		expect((result as any).ir?.nativeId).toContain("xaivid_");
		expect(saveVideoJobMetaMock).toHaveBeenCalledWith(
			"team_test",
			"req_xai_video_test",
			expect.objectContaining({
				provider: "x-ai",
				providerTaskId: "vid_123",
			}),
			"vid_123",
			"queued",
		);
	});

	it("reports the routed xAI model when the public request uses a different alias", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/videos/generations"),
			response: jsonResponse({ id: "vid_routed_15", status: "queued" }),
			onRequest: (call) => {
				capturedBody = call.bodyJson;
			},
		}]);
		const args = buildArgs({
			model: "spacex-ai/grok-imagine-video",
			prompt: "Use the routed model",
			duration: 6,
			resolution: "1080p",
			inputImage: "https://example.com/first-frame.png",
		});
		args.providerModelSlug = "grok-imagine-video-1.5";

		const result = await execute(args);
		mock.restore();

		expect(result.upstream?.status).toBe(200);
		expect(capturedBody?.model).toBe("grok-imagine-video-1.5");
		expect((result as any).ir?.model).toBe("spacex-ai/grok-imagine-video-1.5");
	});

	it("maps a first-frame image to xAI's structured image field", () => {
		const mapped = __xAiVideoGenerateTestUtils.buildXAiVideoRequest({
			model: "x-ai/grok-imagine-video",
			prompt: "Animate the frame",
			inputReferences: [{ type: "image", role: "first_frame", url: "https://example.com/first.png" }],
			resolution: "480p",
		}, "grok-imagine-video");

		expect(mapped).toEqual({
			endpoint: "/videos/generations",
			resolution: "480p",
			seconds: undefined,
			inputImageCount: 1,
			inputVideoCount: 0,
			body: {
				model: "grok-imagine-video",
				prompt: "Animate the frame",
				resolution: "480p",
				image: { url: "https://example.com/first.png" },
			},
		});
	});

	it("maps reference images and source videos to their current xAI modes", () => {
		const references = __xAiVideoGenerateTestUtils.buildXAiVideoRequest({
			model: "x-ai/grok-imagine-video",
			prompt: "Use both references",
			inputReferences: [
				{ type: "image", role: "reference", url: "https://example.com/person.png" },
				{ type: "image", role: "reference", url: "https://example.com/outfit.png" },
			],
		}, "grok-imagine-video");
		expect(references.body).toMatchObject({
			reference_images: [
				{ url: "https://example.com/person.png" },
				{ url: "https://example.com/outfit.png" },
			],
		});
		expect(references.body).not.toHaveProperty("image");

		const edit = __xAiVideoGenerateTestUtils.buildXAiVideoRequest({
			model: "x-ai/grok-imagine-video",
			prompt: "Add a silver necklace",
			inputReferences: [{ type: "video", role: "source", url: "https://example.com/source.mp4" }],
			inputVideoDurationSeconds: 6,
			resolution: "720p",
		}, "grok-imagine-video");
		expect(edit).toEqual({
			endpoint: "/videos/edits",
			resolution: "720p",
			seconds: 6,
			inputImageCount: 0,
			inputVideoCount: 1,
			inputVideoSeconds: 6,
			body: {
				model: "grok-imagine-video",
				prompt: "Add a silver necklace",
				video: { url: "https://example.com/source.mp4" },
				resolution: "720p",
			},
		});
	});

	it("rejects explicit unsupported resolution and aspect ratio values", () => {
		expect(() => __xAiVideoGenerateTestUtils.buildXAiVideoRequest({
			model: "x-ai/grok-imagine-video",
			prompt: "Do not downgrade this request",
			resolution: "1920x1080",
		}, "grok-imagine-video")).toThrow("resolution must be 480p or 720p");

		expect(() => __xAiVideoGenerateTestUtils.buildXAiVideoRequest({
			model: "x-ai/grok-imagine-video",
			prompt: "Do not drop this ratio",
			aspectRatio: "21:9",
		}, "grok-imagine-video")).toThrow("Unsupported xAI video aspect ratio");
	});

	it("enforces Grok Imagine Video 1.5 image-only input and supports 1080p", () => {
		const mapped = __xAiVideoGenerateTestUtils.buildXAiVideoRequest({
			model: "spacex-ai/grok-imagine-video-1.5",
			prompt: "Animate this still frame",
			duration: 5,
			resolution: "1080p",
			inputReferences: [{ type: "image", role: "first_frame", url: "https://example.com/frame.png" }],
		}, "grok-imagine-video-1.5");
		expect(mapped).toMatchObject({
			endpoint: "/videos/generations",
			resolution: "1080p",
			seconds: 5,
			inputImageCount: 1,
			body: {
				model: "grok-imagine-video-1.5",
				image: { url: "https://example.com/frame.png" },
				resolution: "1080p",
			},
		});
		expect(() => __xAiVideoGenerateTestUtils.buildXAiVideoRequest({
			model: "spacex-ai/grok-imagine-video-1.5",
			prompt: "Unsupported text-only request",
			duration: 5,
		}, "grok-imagine-video-1.5")).toThrow("requires exactly one first_frame image");
	});

	it("fails the gateway response when SpaceXAI video metadata cannot be persisted", async () => {
		state.reservationResult = {
			reservationId: "video_hold:req_xai_video_test",
			held: true,
			amountNanos: 123_000_000,
			status: "held",
		};
		state.saveVideoJobMetaError = new Error("async operation store unavailable");
		const mock = installFetchMock([
			{
				match: (url) => url.endsWith("/videos/generations"),
				response: jsonResponse({
					id: "vid_meta_failed",
					status: "queued",
				}),
			},
		]);

		const result = await execute(buildArgs({
			model: "x-ai/grok-imagine-video-latest",
			prompt: "A SpaceXAI metadata persistence failure",
		}));

		mock.restore();

		expect(result.upstream?.status).toBe(502);
		expect(await result.upstream?.clone().json()).toMatchObject({
			error: {
				type: "async_job_persistence_failed",
				native_video_id: expect.stringContaining("xaivid_"),
				reservation_id: "video_hold:req_xai_video_test",
				reservation_status: "held",
			},
		});
		expect(result.ir).toBeUndefined();
		expect(saveVideoJobMetaMock).toHaveBeenCalledTimes(1);
		expect(state.releaseCalls).toEqual([]);
	});

	it("retains a held reservation when SpaceXAI returns success without a generation id", async () => {
		state.reservationResult = {
			reservationId: "video_hold:req_xai_video_test",
			held: true,
			amountNanos: 123_000_000,
			status: "held",
		};
		const mock = installFetchMock([
			{
				match: (url) => url.endsWith("/videos/generations"),
				response: jsonResponse({ status: "queued" }),
			},
		]);

		const result = await execute(buildArgs({
			model: "x-ai/grok-imagine-video-latest",
			prompt: "A SpaceXAI response without a generation id",
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
			reservationId: "video_hold:req_xai_video_test",
			held: false,
			amountNanos: 0,
			status: "skip_missing_seconds_or_pricing",
		};
		const mock = installFetchMock([
			{
				match: (url) => url.endsWith("/videos/generations"),
				response: jsonResponse({
					id: "vid_should_not_submit",
					status: "queued",
				}),
			},
		]);

		const result = await execute(buildArgs({
			model: "x-ai/grok-imagine-video-latest",
			prompt: "A video without duration pricing dimensions",
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
