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
			reservationId: "video_hold:req_minimax_video_test",
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
	beforeEach(() => {
		saveVideoJobMetaMock.mockClear();
		state.reservationResult = null;
		state.releaseCalls = [];
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
		expect(saveVideoJobMetaMock).not.toHaveBeenCalled();
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

	it("releases a held reservation when MiniMax returns success without a task id", async () => {
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
		expect(saveVideoJobMetaMock).not.toHaveBeenCalled();
		expect(state.releaseCalls).toEqual([
			{
				workspaceId: "team_test",
				reservationId: "video_hold:req_minimax_video_test",
				releaseRefId: "req_minimax_video_test",
			},
		]);
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
