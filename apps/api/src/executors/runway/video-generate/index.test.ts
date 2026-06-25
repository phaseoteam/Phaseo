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
			reservationId: "video_hold:req_runway_video_test",
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
		requestId: "req_runway_video_test",
		workspaceId: "team_test",
		providerId: "runway",
		endpoint: "video.generation",
		protocol: "runway.video",
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
		RUNWAY_API_KEY: "test-runway-key",
		RUNWAY_BASE_URL: "https://api.runway.example",
	});
});

afterAll(() => {
	teardownTestRuntime();
});

describe("runway video executor", () => {
	beforeEach(() => {
		saveVideoJobMetaMock.mockClear();
		state.reservationResult = null;
		state.releaseCalls = [];
		state.saveVideoJobMetaError = null;
	});

	it("submits async runway task and stores upstream task id", async () => {
		let capturedBody: any = null;
		const mock = installFetchMock([
			{
				match: (url) => url.endsWith("/v1/text_to_video"),
				response: jsonResponse({
					id: "runway_task_123",
					status: "RUNNING",
				}),
				onRequest: (call) => {
					capturedBody = call.bodyJson;
				},
			},
		]);

		const result = await execute(buildArgs({
			model: "gen4.5",
			prompt: "A studio product shot turning slowly",
			duration: 6,
			aspectRatio: "16:9",
		}));

		mock.restore();

		expect(capturedBody?.model).toBe("gen4.5");
		expect(capturedBody?.promptText).toBe("A studio product shot turning slowly");
		expect(capturedBody?.ratio).toBe("1280:720");
		expect((result as any).ir?.nativeId).toContain("rwyvid_");
		expect(saveVideoJobMetaMock).toHaveBeenCalledWith(
			"team_test",
			"req_runway_video_test",
			expect.objectContaining({
				provider: "runway",
				providerTaskId: "runway_task_123",
			}),
			"runway_task_123",
			"in_progress",
		);
	});

	it("fails the gateway response when Runway video metadata cannot be persisted", async () => {
		state.reservationResult = {
			reservationId: "video_hold:req_runway_video_test",
			held: true,
			amountNanos: 123_000_000,
			status: "held",
		};
		state.saveVideoJobMetaError = new Error("async operation store unavailable");
		const mock = installFetchMock([
			{
				match: (url) => url.endsWith("/v1/text_to_video"),
				response: jsonResponse({ id: "runway_task_meta_failed", status: "RUNNING" }),
			},
		]);

		const result = await execute(buildArgs({
			model: "gen4.5",
			prompt: "A Runway metadata persistence failure",
			duration: 6,
			aspectRatio: "16:9",
		}));

		mock.restore();

		expect(result.upstream?.status).toBe(502);
		expect(await result.upstream?.clone().json()).toMatchObject({
			error: {
				type: "async_job_persistence_failed",
				native_video_id: expect.stringContaining("rwyvid_"),
				reservation_id: "video_hold:req_runway_video_test",
				reservation_status: "held",
			},
		});
		expect(result.ir).toBeUndefined();
		expect(saveVideoJobMetaMock).not.toHaveBeenCalled();
		expect(state.releaseCalls).toEqual([]);
	});

	it("releases a held reservation when Runway returns success without a task id", async () => {
		state.reservationResult = {
			reservationId: "video_hold:req_runway_video_test",
			held: true,
			amountNanos: 123_000_000,
			status: "held",
		};
		const mock = installFetchMock([
			{
				match: (url) => url.endsWith("/v1/text_to_video"),
				response: jsonResponse({ status: "RUNNING" }),
			},
		]);

		const result = await execute(buildArgs({
			model: "gen4.5",
			prompt: "A Runway response without a task id",
			duration: 6,
			aspectRatio: "16:9",
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
				reservationId: "video_hold:req_runway_video_test",
				releaseRefId: "req_runway_video_test",
			},
		]);
	});

	it("does not submit upstream when reservation pricing dimensions are missing", async () => {
		state.reservationResult = {
			reservationId: "video_hold:req_runway_video_test",
			held: false,
			amountNanos: 0,
			status: "skip_missing_seconds_or_pricing",
		};
		const mock = installFetchMock([
			{
				match: (url) => url.endsWith("/v1/text_to_video"),
				response: jsonResponse({
					id: "runway_should_not_submit",
					status: "RUNNING",
				}),
			},
		]);

		const result = await execute(buildArgs({
			model: "gen4.5",
			prompt: "A Runway request without duration pricing dimensions",
			aspectRatio: "16:9",
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
