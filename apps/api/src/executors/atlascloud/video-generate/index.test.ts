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
			reservationId: "video_hold:req_atlas_video_test",
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
		expect(saveVideoJobMetaMock).not.toHaveBeenCalled();
		expect(state.releaseCalls).toEqual([]);
	});

	it("releases a held reservation when AtlasCloud returns success without a prediction id", async () => {
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
		expect(saveVideoJobMetaMock).not.toHaveBeenCalled();
		expect(state.releaseCalls).toEqual([
			{
				workspaceId: "team_test",
				reservationId: "video_hold:req_atlas_video_test",
				releaseRefId: "req_atlas_video_test",
			},
		]);
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
