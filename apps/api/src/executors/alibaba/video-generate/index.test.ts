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
		expect(capturedBody?.model).toBe("qwen/wan2.2-t2v-plus");
		expect(capturedBody?.input?.prompt).toBe("A calm mountain lake at sunrise");
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
		expect(saveVideoJobMetaMock).not.toHaveBeenCalled();
		expect(state.releaseCalls).toEqual([]);
	});

	it("releases a held reservation when Alibaba returns success without a task id", async () => {
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
		expect(saveVideoJobMetaMock).not.toHaveBeenCalled();
		expect(state.releaseCalls).toEqual([
			{
				workspaceId: "team_test",
				reservationId: "video_hold:req_wan_video_test",
				releaseRefId: "req_wan_video_test",
			},
		]);
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
