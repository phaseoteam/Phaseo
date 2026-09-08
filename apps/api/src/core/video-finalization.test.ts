import { beforeEach, describe, expect, it, vi } from "vitest";

const setVideoJobStatusMock = vi.fn();
const getVideoJobMetaMock = vi.fn();
const getVideoJobRecordMock = vi.fn();
const isVideoJobBilledMock = vi.fn();
const markVideoJobBilledMock = vi.fn();
const captureWalletReservationMock = vi.fn();
const releaseWalletReservationMock = vi.fn();
const settleWalletReservationMock = vi.fn();
const loadPriceCardMock = vi.fn();
const computeBillMock = vi.fn();
const applyByokServiceFeeMock = vi.fn();
const recordUsageAndChargeMock = vi.fn();
const getSupabaseAdminMock = vi.fn();
const syncWorkspaceUsageRollupForRequestMock = vi.fn();
const emitGatewayOperationalFailureMock = vi.fn();
vi.mock("@/observability/axiom", () => ({ emitGatewayOperationalFailure: (...args: unknown[]) => emitGatewayOperationalFailureMock(...args) }));

vi.mock("@core/video-jobs", () => ({
	setVideoJobStatus: (...args: unknown[]) => setVideoJobStatusMock(...args),
	getVideoJobMeta: (...args: unknown[]) => getVideoJobMetaMock(...args),
	getVideoJobRecord: (...args: unknown[]) => getVideoJobRecordMock(...args),
	isVideoJobBilled: (...args: unknown[]) => isVideoJobBilledMock(...args),
	markVideoJobBilled: (...args: unknown[]) => markVideoJobBilledMock(...args),
}));

vi.mock("@core/wallet-reservations", () => ({
	captureWalletReservation: (...args: unknown[]) => captureWalletReservationMock(...args),
	releaseWalletReservation: (...args: unknown[]) => releaseWalletReservationMock(...args),
	settleWalletReservation: (...args: unknown[]) => settleWalletReservationMock(...args),
}));

vi.mock("@pipeline/pricing/loader", () => ({
	loadPriceCard: (...args: unknown[]) => loadPriceCardMock(...args),
}));

vi.mock("@pipeline/pricing/engine", () => ({
	computeBill: (...args: unknown[]) => computeBillMock(...args),
}));

vi.mock("@pipeline/pricing/byok-fee", () => ({
	applyByokServiceFee: (...args: unknown[]) => applyByokServiceFeeMock(...args),
}));

vi.mock("@pipeline/pricing/persist", () => ({
	recordUsageAndCharge: (...args: unknown[]) => recordUsageAndChargeMock(...args),
}));

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: (...args: unknown[]) => getSupabaseAdminMock(...args),
}));

vi.mock("@core/workspace-usage-rollups", () => ({
	syncWorkspaceUsageRollupForRequest: (...args: unknown[]) => syncWorkspaceUsageRollupForRequestMock(...args),
}));

import { finalizeVideoJob } from "./video-finalization";

describe("video-finalization", () => {
	it.each([undefined, { mode: "text-to-video" }])("settles LTX audio using the stored endpoint with polling options %j", async (requestOptions) => {
		const { computeBill } = await vi.importActual<typeof import("@pipeline/pricing/engine")>("@pipeline/pricing/engine");
		const { default: catalog } = await import("../../../../packages/data/catalog/src/data/pricing/ltx/ltx-2-3-pro/video.generate/pricing.json");
		getVideoJobMetaMock.mockResolvedValue({ model: "ltx-2-3-pro", seconds: 20, resolution: "3840x2160",
			ltxEndpoint: "audio-to-video", inputAudioSeconds: 20, keySource: "gateway",
			reservationId: "video_hold:ltx_audio", reservedNanos: 6_800_000_000 });
		loadPriceCardMock.mockResolvedValue({ ...catalog, provider: "ltx", model: "ltx-2-3-pro", currency: "USD" });
		computeBillMock.mockImplementation(computeBill);
		applyByokServiceFeeMock.mockImplementation(async ({ baseCostNanos, pricedUsage }) => ({ totalNanos: baseCostNanos, pricedUsage }));
		settleWalletReservationMock.mockResolvedValue({ applied: true, status: "captured", amountNanos: 6_800_000_000 });
		captureWalletReservationMock.mockResolvedValue({ applied: true, status: "captured", amountNanos: 6_800_000_000 });
		const result = await finalizeVideoJob({ workspaceId: "ws_test", videoId: "ltx_audio", providerId: "ltx", status: "completed", requestOptions });
		expect(result.charged).toBe(true);
		expect(applyByokServiceFeeMock).toHaveBeenCalledWith(expect.objectContaining({ baseCostNanos: 6_800_000_000 }));
		expect(computeBillMock).toHaveBeenCalledWith(expect.objectContaining({ input_audio_seconds: 20 }), expect.anything(), expect.anything());
		expect(releaseWalletReservationMock).not.toHaveBeenCalled();
	});
	it("retains the hold and records an actionable error when pricing is incomplete", async () => {
		getVideoJobMetaMock.mockResolvedValue({
			model: "openai/sora-2", seconds: 4, keySource: "gateway",
			reservationId: "video_hold:pricing_error", reservedNanos: 400_000_000,
		});
		loadPriceCardMock.mockResolvedValue({ rules: [] });
		computeBillMock.mockImplementation(() => { throw new Error("pricing_rule_missing:output_video_seconds"); });
		const result = await finalizeVideoJob({
			workspaceId: "ws_test", videoId: "video_test", providerId: "openai",
			status: "completed", model: "openai/sora-2", seconds: 4,
		});
		expect(result).toMatchObject({ charged: false, reason: "pricing_error" });
		expect(captureWalletReservationMock).not.toHaveBeenCalled();
		expect(settleWalletReservationMock).not.toHaveBeenCalled();
		expect(releaseWalletReservationMock).not.toHaveBeenCalled();
		expect(markVideoJobBilledMock).not.toHaveBeenCalled();
		expect(setVideoJobStatusMock).toHaveBeenCalledWith("ws_test", "video_test", "completed",
			expect.objectContaining({ billingReason: "pricing_error", billingError: "pricing_rule_missing:output_video_seconds" }));
		expect(emitGatewayOperationalFailureMock).toHaveBeenCalledWith(expect.objectContaining({ reason: "pricing_error" }));
	});
	it("preserves completion time and duration on repeated terminal reads", async () => {
		const finalizedAt = "2026-09-06T10:00:30.000Z";
		getVideoJobRecordMock.mockResolvedValue({ status: "completed", meta: {
			finalizedAt, providerDispatchedAtMs: Date.parse("2026-09-06T10:00:00.000Z"),
		} });
		isVideoJobBilledMock.mockResolvedValue(true);
		await finalizeVideoJob({ workspaceId: "ws_test", videoId: "video_test", providerId: "openai", status: "completed" });
		expect(setVideoJobStatusMock).toHaveBeenCalledWith("ws_test", "video_test", "completed",
			expect.objectContaining({ finalizedAt, durationMs: 30000 }));
		expect(captureWalletReservationMock).not.toHaveBeenCalled();
	});
	beforeEach(() => {
		setVideoJobStatusMock.mockReset();
		getVideoJobMetaMock.mockReset();
		getVideoJobRecordMock.mockReset();
		isVideoJobBilledMock.mockReset();
		markVideoJobBilledMock.mockReset();
		captureWalletReservationMock.mockReset();
		releaseWalletReservationMock.mockReset();
		settleWalletReservationMock.mockReset();
		loadPriceCardMock.mockReset();
		computeBillMock.mockReset();
		applyByokServiceFeeMock.mockReset();
		recordUsageAndChargeMock.mockReset();
		getSupabaseAdminMock.mockReset();
		syncWorkspaceUsageRollupForRequestMock.mockReset();
		emitGatewayOperationalFailureMock.mockReset();

		setVideoJobStatusMock.mockResolvedValue(undefined);
		getVideoJobMetaMock.mockResolvedValue({
			model: "openai/sora-2",
			seconds: 4,
			keySource: "gateway",
		});
		getVideoJobRecordMock.mockResolvedValue({
			status: "in_progress",
		});
		isVideoJobBilledMock.mockResolvedValue(false);
		markVideoJobBilledMock.mockResolvedValue(undefined);
		syncWorkspaceUsageRollupForRequestMock.mockResolvedValue(undefined);
	});

	it("retains a paid hold and records an anomaly when completion pricing becomes zero", async () => {
		getVideoJobMetaMock.mockResolvedValue({ model: "openai/sora-2", seconds: 4, keySource: "gateway", reservationId: "hold", reservedNanos: 100_000_000, reservationStatus: "held" });
		loadPriceCardMock.mockResolvedValue({ rules: [] });
		computeBillMock.mockReturnValue({ pricing: { total_nanos: 0 } });
		applyByokServiceFeeMock.mockResolvedValue({ totalNanos: 0, pricedUsage: { pricing: { total_nanos: 0 } } });
		const result = await finalizeVideoJob({ workspaceId: "ws", videoId: "video", providerId: "openai", status: "completed", model: "openai/sora-2", seconds: 4 });
		expect(result.reason).toBe("unexpected_zero_cost");
		expect(setVideoJobStatusMock).toHaveBeenCalledWith("ws", "video", "completed", expect.objectContaining({ billingReason: "unexpected_zero_cost", charged: false }));
		expect(emitGatewayOperationalFailureMock).toHaveBeenCalledWith(expect.objectContaining({ reason: "unexpected_zero_cost" }));
		expect(releaseWalletReservationMock).not.toHaveBeenCalled();
		expect(settleWalletReservationMock).not.toHaveBeenCalled();
		expect(markVideoJobBilledMock).not.toHaveBeenCalled();
	});

	it("does not legacy-charge when reservation is already released", async () => {
		captureWalletReservationMock.mockResolvedValue({
			applied: false,
			alreadyApplied: true,
			status: "released",
			amountNanos: 5000000,
		});

		const result = await finalizeVideoJob({
			workspaceId: "team_1",
			videoId: "video_1",
			providerId: "openai",
			status: "completed",
			model: "openai/sora-2",
			seconds: 4,
		});

		expect(result).toEqual({
			status: "completed",
			charged: false,
			reason: "released",
		});
		expect(recordUsageAndChargeMock).not.toHaveBeenCalled();
		expect(markVideoJobBilledMock).toHaveBeenCalledWith("team_1", "video_1");
		expect(setVideoJobStatusMock).toHaveBeenCalledWith(
			"team_1",
			"video_1",
			"completed",
			expect.objectContaining({
				billingReason: "released",
				reservationStatus: "released",
			}),
		);
	});

	it("does not release reservations again when a failed video is already billed", async () => {
		isVideoJobBilledMock.mockResolvedValue(true);
		getVideoJobRecordMock.mockResolvedValue({
			status: "failed",
			createdAt: "2026-05-03T10:00:00.000Z",
			meta: {
				createdAt: Date.parse("2026-05-03T10:00:00.000Z"),
			},
		});
		getVideoJobMetaMock.mockResolvedValue({
			model: "openai/sora-2",
			seconds: 4,
			reservationId: "video_hold:req_already_billed_failed",
			reservedNanos: 150_000_000,
			reservationStatus: "released",
		});

		const result = await finalizeVideoJob({
			workspaceId: "team_already_billed",
			videoId: "video_already_billed_failed",
			providerId: "openai",
			status: "failed",
			model: "openai/sora-2",
			seconds: 4,
		});

		expect(result).toEqual({
			status: "failed",
			charged: false,
			reason: "already_billed",
		});
		expect(releaseWalletReservationMock).not.toHaveBeenCalled();
		expect(captureWalletReservationMock).not.toHaveBeenCalled();
		expect(recordUsageAndChargeMock).not.toHaveBeenCalled();
		expect(markVideoJobBilledMock).not.toHaveBeenCalled();
		expect(setVideoJobStatusMock).toHaveBeenLastCalledWith(
			"team_already_billed",
			"video_already_billed_failed",
			"failed",
			expect.objectContaining({
				billingReason: "already_billed",
				durationMs: expect.any(Number),
			}),
		);
	});

	it("does not capture reservations again when a completed video is already billed", async () => {
		isVideoJobBilledMock.mockResolvedValue(true);
		getVideoJobRecordMock.mockResolvedValue({
			status: "completed",
		});
		getVideoJobMetaMock.mockResolvedValue({
			model: "openai/sora-2",
			seconds: 4,
			reservationId: "video_hold:req_already_billed_completed",
			reservedNanos: 150_000_000,
			reservationStatus: "captured",
		});

		const result = await finalizeVideoJob({
			workspaceId: "team_already_billed",
			videoId: "video_already_billed_completed",
			providerId: "openai",
			status: "completed",
			model: "openai/sora-2",
			seconds: 4,
		});

		expect(result).toEqual({
			status: "completed",
			charged: false,
			reason: "already_billed",
		});
		expect(captureWalletReservationMock).not.toHaveBeenCalled();
		expect(releaseWalletReservationMock).not.toHaveBeenCalled();
		expect(recordUsageAndChargeMock).not.toHaveBeenCalled();
		expect(markVideoJobBilledMock).not.toHaveBeenCalled();
		expect(setVideoJobStatusMock).toHaveBeenLastCalledWith(
			"team_already_billed",
			"video_already_billed_completed",
			"completed",
			expect.objectContaining({
				billingReason: "already_billed",
			}),
		);
	});

	it("captures a held reservation on completed jobs and records reservation status", async () => {
		captureWalletReservationMock.mockResolvedValue({
			applied: true,
			alreadyApplied: false,
			status: "captured",
			amountNanos: 150_000_000,
		});

		const result = await finalizeVideoJob({
			workspaceId: "team_capture",
			videoId: "video_capture",
			providerId: "openai",
			status: "completed",
			model: "openai/sora-2",
			seconds: 4,
		});

		expect(result).toEqual({
			status: "completed",
			charged: true,
			reason: "captured",
		});
		expect(recordUsageAndChargeMock).not.toHaveBeenCalled();
		expect(markVideoJobBilledMock).toHaveBeenCalledWith("team_capture", "video_capture");
		expect(setVideoJobStatusMock).toHaveBeenCalledWith(
			"team_capture",
			"video_capture",
			"completed",
			expect.objectContaining({
				charged: true,
				costNanos: 150_000_000,
				costUsd: 0.15,
				billingReason: "captured",
				reservationStatus: "captured",
			}),
		);
	});

	it("defers billed marking after capture when gateway request sync cannot find the audit row", async () => {
		getVideoJobMetaMock.mockResolvedValue({
			model: "openai/sora-2",
			seconds: 4,
			keySource: "gateway",
			requestId: "req_video_sync_missing",
			reservationId: "video_hold:req_video_sync_missing",
			reservedNanos: 150_000_000,
			reservationStatus: "held",
		});
		captureWalletReservationMock.mockResolvedValue({
			applied: true,
			alreadyApplied: false,
			status: "captured",
			amountNanos: 150_000_000,
		});
		const limitMock = vi.fn().mockResolvedValue({ data: [], error: null });
		const orderMock = vi.fn(() => ({ limit: limitMock }));
		const secondEqMock = vi.fn(() => ({ order: orderMock }));
		const firstEqMock = vi.fn(() => ({ eq: secondEqMock }));
		const selectMock = vi.fn(() => ({ eq: firstEqMock }));
		const fromMock = vi.fn(() => ({ select: selectMock }));
		getSupabaseAdminMock.mockReturnValue({ from: fromMock });

		const result = await finalizeVideoJob({
			workspaceId: "team_capture_sync_missing",
			videoId: "video_capture_sync_missing",
			providerId: "openai",
			status: "completed",
			model: "openai/sora-2",
			seconds: 4,
		});

		expect(result).toEqual({
			status: "completed",
			charged: true,
			reason: "captured",
		});
		expect(captureWalletReservationMock).toHaveBeenCalledWith({
			workspaceId: "team_capture_sync_missing",
			reservationId: "video_hold:req_video_sync_missing",
			captureRefId: "video_capture_sync_missing",
		});
		expect(setVideoJobStatusMock).toHaveBeenCalledWith(
			"team_capture_sync_missing",
			"video_capture_sync_missing",
			"completed",
			expect.objectContaining({
				charged: true,
				costNanos: 150_000_000,
				reservationStatus: "captured",
			}),
		);
		expect(fromMock).toHaveBeenCalledWith("gateway_requests");
		expect(limitMock).toHaveBeenCalledTimes(3);
		expect(markVideoJobBilledMock).not.toHaveBeenCalled();
		expect(recordUsageAndChargeMock).not.toHaveBeenCalled();
	});

	it.each([false, true])("settles using the persisted charge on replay=%s", async (replay) => {
		getVideoJobMetaMock.mockResolvedValue({
			provider: "openai",
			model: "openai/sora-2",
			seconds: 4,
			outputCount: 3,
			keySource: "gateway",
			reservationId: "video_hold:req_mismatch",
			reservedNanos: 300_000_000,
			reservationStatus: "held",
		});
		loadPriceCardMock.mockResolvedValue({
			provider: "openai",
			model: "openai/sora-2",
			endpoint: "video.generation",
			currency: "USD",
			effective_from: null,
			version: null,
			rules: [],
		});
		computeBillMock.mockReturnValue({
			pricing: { total_nanos: 200_000_000 },
		});
		applyByokServiceFeeMock.mockResolvedValue({
			totalNanos: 200_000_000,
			pricedUsage: { pricing: { total_nanos: 200_000_000 } },
		});
		settleWalletReservationMock.mockResolvedValue({
			applied: !replay,
			alreadyApplied: replay,
			status: "captured",
			amountNanos: replay ? 150_000_000 : 200_000_000,
		});

		const result = await finalizeVideoJob({
			workspaceId: "team_mismatch",
			videoId: "video_mismatch",
			providerId: "openai",
			status: "completed",
			model: "openai/sora-2",
			seconds: 4,
		});

		expect(result).toEqual({
			status: "completed",
			charged: true,
			pricedUsage: replay ? undefined : { pricing: { total_nanos: 200_000_000 } },
			reason: replay ? "already_captured" : "captured",
		});
		expect(computeBillMock).toHaveBeenCalledWith(
			expect.objectContaining({ output_video_seconds: 12, output_video: 3 }),
			expect.anything(),
			expect.anything(),
		);
		expect(captureWalletReservationMock).not.toHaveBeenCalled();
		expect(settleWalletReservationMock).toHaveBeenCalledWith({
			workspaceId: "team_mismatch",
			reservationId: "video_hold:req_mismatch",
			settleRefId: "video_mismatch",
			actualNanos: 200_000_000,
		});
		expect(releaseWalletReservationMock).not.toHaveBeenCalled();
		expect(recordUsageAndChargeMock).not.toHaveBeenCalled();
		expect(markVideoJobBilledMock).toHaveBeenCalledWith("team_mismatch", "video_mismatch");
		expect(setVideoJobStatusMock).toHaveBeenCalledWith(
			"team_mismatch",
			"video_mismatch",
			"completed",
			expect.objectContaining({
				charged: true,
				costNanos: replay ? 150_000_000 : 200_000_000,
				costUsd: replay ? 0.15 : 0.2,
				billingReason: replay ? "already_captured" : "captured",
				reservationStatus: replay ? "already_captured" : "captured",
			}),
		);
	});

	it("keeps exact-cost completed videos unbilled when reservation capture throws", async () => {
		getVideoJobMetaMock.mockResolvedValue({
			provider: "openai",
			model: "openai/sora-2",
			seconds: 4,
			keySource: "gateway",
			reservationId: "video_hold:req_capture_failed",
			reservedNanos: 200_000_000,
			reservationStatus: "held",
		});
		loadPriceCardMock.mockResolvedValue({
			provider: "openai",
			model: "openai/sora-2",
			endpoint: "video.generation",
			currency: "USD",
			effective_from: null,
			version: null,
			rules: [],
		});
		computeBillMock.mockReturnValue({
			pricing: { total_nanos: 200_000_000 },
		});
		applyByokServiceFeeMock.mockResolvedValue({
			totalNanos: 200_000_000,
			pricedUsage: { pricing: { total_nanos: 200_000_000 } },
		});
		captureWalletReservationMock.mockRejectedValue(new Error("capture_timeout"));

		const result = await finalizeVideoJob({
			workspaceId: "team_capture_failed",
			videoId: "video_capture_failed",
			providerId: "openai",
			status: "completed",
			model: "openai/sora-2",
			seconds: 4,
		});

		expect(result).toEqual({
			status: "completed",
			charged: false,
			pricedUsage: { pricing: { total_nanos: 200_000_000 } },
			reason: "capture_failed",
		});
		expect(recordUsageAndChargeMock).not.toHaveBeenCalled();
		expect(markVideoJobBilledMock).not.toHaveBeenCalled();
		expect(setVideoJobStatusMock).toHaveBeenCalledWith(
			"team_capture_failed",
			"video_capture_failed",
			"completed",
			expect.objectContaining({
				charged: false,
				billingReason: "capture_failed",
				reservationStatus: "capture_failed",
				pricedUsage: { pricing: { total_nanos: 200_000_000 } },
			}),
		);
	});

	it.each(["settlement_failed", "reservation_not_found", "insufficient_balance"])("keeps completed video holds safe after %s", async (reason) => {
		getVideoJobMetaMock.mockResolvedValue({
			provider: "openai",
			model: "openai/sora-2",
			seconds: 4,
			keySource: "gateway",
			reservationId: "video_hold:req_release_failed",
			reservedNanos: 300_000_000,
			reservationStatus: "held",
		});
		loadPriceCardMock.mockResolvedValue({
			provider: "openai",
			model: "openai/sora-2",
			endpoint: "video.generation",
			currency: "USD",
			effective_from: null,
			version: null,
			rules: [],
		});
		computeBillMock.mockReturnValue({
			pricing: { total_nanos: 200_000_000 },
		});
		applyByokServiceFeeMock.mockResolvedValue({
			totalNanos: 200_000_000,
			pricedUsage: { pricing: { total_nanos: 200_000_000 } },
		});
		if (reason === "settlement_failed") {
			settleWalletReservationMock.mockRejectedValue(new Error("settlement_timeout"));
		} else {
			settleWalletReservationMock.mockResolvedValue({ status: reason, applied: false, alreadyApplied: false });
		}

		const result = await finalizeVideoJob({
			workspaceId: "team_release_failed",
			videoId: "video_release_failed",
			providerId: "openai",
			status: "completed",
			model: "openai/sora-2",
			seconds: 4,
		});

		expect(result).toMatchObject({
			status: "completed",
			charged: false,
			reason,
		});
		expect(releaseWalletReservationMock).not.toHaveBeenCalled();
		expect(recordUsageAndChargeMock).not.toHaveBeenCalled();
		expect(markVideoJobBilledMock).not.toHaveBeenCalled();
		expect(setVideoJobStatusMock).toHaveBeenCalledWith(
			"team_release_failed",
			"video_release_failed",
			"completed",
			expect.objectContaining({
				charged: false,
				billingReason: reason,
				reservationStatus: reason,
			}),
		);
	});

	it("does not legacy-charge when reservation capture was already applied", async () => {
		captureWalletReservationMock.mockResolvedValue({
			applied: false,
			alreadyApplied: true,
			status: "captured",
			amountNanos: 5000000,
		});

		const result = await finalizeVideoJob({
			workspaceId: "team_1",
			videoId: "video_captured_retry",
			providerId: "openai",
			status: "completed",
			model: "openai/sora-2",
			seconds: 4,
		});

		expect(result).toEqual({
			status: "completed",
			charged: true,
			reason: "captured",
		});
		expect(recordUsageAndChargeMock).not.toHaveBeenCalled();
		expect(markVideoJobBilledMock).toHaveBeenCalledWith("team_1", "video_captured_retry");
	});

	it("falls back to legacy debit only when reservation is not found", async () => {
		captureWalletReservationMock.mockResolvedValue({
			applied: false,
			alreadyApplied: false,
			status: "not_found",
			amountNanos: 0,
		});
		loadPriceCardMock.mockResolvedValue({
			provider: "openai",
			model: "openai/sora-2",
			endpoint: "video.generation",
			currency: "USD",
			effective_from: null,
			version: null,
			rules: [],
		});
		computeBillMock.mockReturnValue({
			pricing: { total_nanos: 1234 },
		});
		applyByokServiceFeeMock.mockResolvedValue({
			totalNanos: 1234,
			pricedUsage: { pricing: { total_nanos: 1234 } },
		});
		recordUsageAndChargeMock.mockResolvedValue(undefined);

		const result = await finalizeVideoJob({
			workspaceId: "team_2",
			videoId: "video_2",
			providerId: "openai",
			status: "completed",
			model: "openai/sora-2",
			seconds: 4,
		});

		expect(result.status).toBe("completed");
		expect(result.charged).toBe(true);
		expect(recordUsageAndChargeMock).toHaveBeenCalledWith(
			expect.objectContaining({
				requestId: "video_capture:video_2",
				workspaceId: "team_2",
				cost_nanos: 1234,
			}),
		);
		expect(markVideoJobBilledMock).toHaveBeenCalledWith("team_2", "video_2");
	});

	it("does not legacy-charge again when reservation is missing but the video is already billed", async () => {
		captureWalletReservationMock.mockResolvedValue({
			applied: false,
			alreadyApplied: false,
			status: "not_found",
			amountNanos: 0,
		});
		isVideoJobBilledMock.mockResolvedValue(true);
		loadPriceCardMock.mockResolvedValue({
			provider: "openai",
			model: "openai/sora-2",
			endpoint: "video.generation",
			currency: "USD",
			effective_from: null,
			version: null,
			rules: [],
		});

		const result = await finalizeVideoJob({
			workspaceId: "team_2",
			videoId: "video_legacy_retry",
			providerId: "openai",
			status: "completed",
			model: "openai/sora-2",
			seconds: 4,
		});

		expect(result).toEqual({
			status: "completed",
			charged: false,
			pricedUsage: undefined,
			reason: "already_billed",
		});
		expect(recordUsageAndChargeMock).not.toHaveBeenCalled();
		expect(markVideoJobBilledMock).not.toHaveBeenCalled();
	});

	it("does not legacy-charge when capture RPC throws", async () => {
		captureWalletReservationMock.mockRejectedValue(new Error("rpc_timeout"));
		loadPriceCardMock.mockResolvedValue({
			provider: "openai",
			model: "openai/sora-2",
			endpoint: "video.generation",
			currency: "USD",
			effective_from: null,
			version: null,
			rules: [],
		});
		computeBillMock.mockReturnValue({
			pricing: { total_nanos: 9999 },
		});
		applyByokServiceFeeMock.mockResolvedValue({
			totalNanos: 9999,
			pricedUsage: { pricing: { total_nanos: 9999 } },
		});

		const result = await finalizeVideoJob({
			workspaceId: "team_4",
			videoId: "video_4",
			providerId: "openai",
			status: "completed",
			model: "openai/sora-2",
			seconds: 4,
		});

		expect(result).toEqual({
			status: "completed",
			charged: false,
			reason: "capture_failed",
		});
		expect(recordUsageAndChargeMock).not.toHaveBeenCalled();
		expect(markVideoJobBilledMock).not.toHaveBeenCalled();
	});

	it.each(["failed", "cancelled", "expired"] as const)("releases reservation on %s terminal status", async (status) => {
		getVideoJobRecordMock.mockResolvedValueOnce({
			status: "in_progress",
			createdAt: "2026-06-10T20:00:00.000Z",
		});
		releaseWalletReservationMock.mockResolvedValue({
			applied: true,
			alreadyApplied: false,
			status: "released",
			amountNanos: 5000000,
		});

		const result = await finalizeVideoJob({
			workspaceId: "team_3",
			videoId: "video_3",
			providerId: "alibaba",
			status,
		});

		expect(result).toEqual({
			status,
			charged: false,
			reason: "released",
		});
		expect(recordUsageAndChargeMock).not.toHaveBeenCalled();
		expect(captureWalletReservationMock).not.toHaveBeenCalled();
		expect(markVideoJobBilledMock).toHaveBeenCalledWith("team_3", "video_3");
		expect(setVideoJobStatusMock).toHaveBeenCalledWith(
			"team_3",
			"video_3",
			status,
			expect.objectContaining({
				charged: false,
				costNanos: 0,
				costUsd: 0,
				durationMs: expect.any(Number),
				billingReason: "released",
				reservationStatus: "released",
			}),
		);
	});
});
