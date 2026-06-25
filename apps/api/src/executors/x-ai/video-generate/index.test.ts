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
		}));

		mock.restore();

		expect(result.upstream?.status).toBe(200);
		expect(capturedUrl).toContain("/videos/generations");
		expect(capturedBody?.model).toBe("grok-imagine-video");
		expect((result as any).ir?.model).toBe("grok-imagine-video");
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

	it("fails the gateway response when xAI video metadata cannot be persisted", async () => {
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
			prompt: "An xAI metadata persistence failure",
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
		expect(saveVideoJobMetaMock).not.toHaveBeenCalled();
		expect(state.releaseCalls).toEqual([]);
	});

	it("releases a held reservation when xAI returns success without a generation id", async () => {
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
			prompt: "An xAI response without a generation id",
		}));

		mock.restore();

		expect(result.upstream?.status).toBe(502);
		expect(await result.upstream?.clone().json()).toMatchObject({
			error: {
				type: "invalid_upstream_response",
			},
		});
		expect(result.ir).toBeUndefined();
		expect(saveVideoJobMetaMock).not.toHaveBeenCalled();
		expect(state.releaseCalls).toEqual([
			{
				workspaceId: "team_test",
				reservationId: "video_hold:req_xai_video_test",
				releaseRefId: "req_xai_video_test",
			},
		]);
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
