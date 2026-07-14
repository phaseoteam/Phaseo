import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { IRVideoGenerationRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { execute } from "./index";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";

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
			reservationId: "video_hold:req_bytedance_video_test",
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
		requestId: "req_bytedance_video_test",
		workspaceId: "team_test",
		providerId: "bytedance-seed",
		endpoint: "video.generation",
		protocol: "bytedance.seed.video",
		capability: "video.generate",
		providerModelSlug: null,
		capabilityParams: null,
		byokMeta: [],
		pricingCard: null,
		meta: {},
	} as ExecutorExecuteArgs;
}

beforeAll(() => {
	setupRuntimeFromEnv({
		SUPABASE_URL: "https://example.supabase.co",
		SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
		BYTEDANCE_SEED_API_KEY: "test-bytedance-key",
		BYTEDANCE_SEED_BASE_URL: "https://api.bytedance.example",
	});
});

afterAll(() => {
	teardownTestRuntime();
});

describe("bytedance seed video executor", () => {
	beforeEach(() => {
		saveVideoJobMetaMock.mockClear();
		state.reservationResult = null;
		state.releaseCalls = [];
		state.saveVideoJobMetaError = null;
	});

	it("submits async seedance task and stores upstream task id", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url.endsWith("/api/v3/contents/generations/tasks"),
				response: jsonResponse({
					id: "seedance_task_123",
					status: "queued",
				}),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
			},
		]);

		const result = await execute(buildArgs({
			model: "bytedance-seed/seedance-1-5-pro",
			prompt: "A street market at night",
			duration: 6,
			size: "1280x720",
		}));

		mock.restore();

		expect(result.upstream?.status).toBe(200);
		expect(capturedBody?.model).toBe("bytedance-seed/seedance-1-5-pro");
		expect(capturedBody?.content?.[0]).toMatchObject({
			type: "text",
			text: "A street market at night",
		});
		expect((result as any).ir?.nativeId).toContain("bdvid_");
		expect(saveVideoJobMetaMock).toHaveBeenCalledWith(
			"team_test",
			"req_bytedance_video_test",
			expect.objectContaining({
				provider: "bytedance-seed",
				providerTaskId: "seedance_task_123",
			}),
			"seedance_task_123",
			"queued",
		);
	});

	it("fails the gateway response when Bytedance video metadata cannot be persisted", async () => {
		state.reservationResult = {
			reservationId: "video_hold:req_bytedance_video_test",
			held: true,
			amountNanos: 123_000_000,
			status: "held",
		};
		state.saveVideoJobMetaError = new Error("async operation store unavailable");
		const mock = installFetchMock([
			{
				match: (url) => url.endsWith("/api/v3/contents/generations/tasks"),
				response: jsonResponse({
					id: "seedance_task_meta_failed",
					status: "queued",
				}),
			},
		]);

		const result = await execute(buildArgs({
			model: "bytedance-seed/seedance-1-5-pro",
			prompt: "A Bytedance metadata persistence failure",
			duration: 6,
			size: "1280x720",
		}));

		mock.restore();

		expect(result.upstream?.status).toBe(502);
		expect(await result.upstream?.clone().json()).toMatchObject({
			error: {
				type: "async_job_persistence_failed",
				native_video_id: expect.stringContaining("bdvid_"),
				reservation_id: "video_hold:req_bytedance_video_test",
				reservation_status: "held",
			},
		});
		expect(result.ir).toBeUndefined();
		expect(saveVideoJobMetaMock).not.toHaveBeenCalled();
		expect(state.releaseCalls).toEqual([]);
	});

	it("releases a held reservation when Bytedance returns success without a task id", async () => {
		state.reservationResult = {
			reservationId: "video_hold:req_bytedance_video_test",
			held: true,
			amountNanos: 123_000_000,
			status: "held",
		};
		const mock = installFetchMock([
			{
				match: (url) => url.endsWith("/api/v3/contents/generations/tasks"),
				response: jsonResponse({ status: "queued" }),
			},
		]);

		const result = await execute(buildArgs({
			model: "bytedance-seed/seedance-1-5-pro",
			prompt: "A Seedance response without task id",
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
				reservationId: "video_hold:req_bytedance_video_test",
				releaseRefId: "req_bytedance_video_test",
			},
		]);
	});

	it("does not submit upstream when reservation pricing dimensions are missing", async () => {
		state.reservationResult = {
			reservationId: "video_hold:req_bytedance_video_test",
			held: false,
			amountNanos: 0,
			status: "skip_missing_seconds_or_pricing",
		};
		const mock = installFetchMock([
			{
				match: (url) => url.endsWith("/api/v3/contents/generations/tasks"),
				response: jsonResponse({
					id: "seedance_should_not_submit",
					status: "queued",
				}),
			},
		]);

		const result = await execute(buildArgs({
			model: "bytedance-seed/seedance-1-5-pro",
			prompt: "A Seedance request without duration pricing dimensions",
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
