import { beforeEach, describe, expect, it, vi } from "vitest";

const setVideoJobStatusMock = vi.fn();
const getVideoJobMetaMock = vi.fn();
const getVideoJobRecordMock = vi.fn();
const isVideoJobBilledMock = vi.fn();
const markVideoJobBilledMock = vi.fn();
const captureWalletReservationMock = vi.fn();
const releaseWalletReservationMock = vi.fn();
const loadPriceCardMock = vi.fn();
const computeBillMock = vi.fn();
const applyByokServiceFeeMock = vi.fn();
const recordUsageAndChargeMock = vi.fn();
const getSupabaseAdminMock = vi.fn();
const syncWorkspaceUsageRollupForRequestMock = vi.fn();

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
	beforeEach(() => {
		setVideoJobStatusMock.mockReset();
		getVideoJobMetaMock.mockReset();
		getVideoJobRecordMock.mockReset();
		isVideoJobBilledMock.mockReset();
		markVideoJobBilledMock.mockReset();
		captureWalletReservationMock.mockReset();
		releaseWalletReservationMock.mockReset();
		loadPriceCardMock.mockReset();
		computeBillMock.mockReset();
		applyByokServiceFeeMock.mockReset();
		recordUsageAndChargeMock.mockReset();
		getSupabaseAdminMock.mockReset();
		syncWorkspaceUsageRollupForRequestMock.mockReset();

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

	it("releases a mismatched reservation and charges final computed usage", async () => {
		getVideoJobMetaMock.mockResolvedValue({
			provider: "openai",
			model: "openai/sora-2",
			seconds: 4,
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
		releaseWalletReservationMock.mockResolvedValue({
			applied: true,
			alreadyApplied: false,
			status: "released",
			amountNanos: 300_000_000,
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
			pricedUsage: { pricing: { total_nanos: 200_000_000 } },
			reason: "released_and_charged_actual",
		});
		expect(captureWalletReservationMock).not.toHaveBeenCalled();
		expect(releaseWalletReservationMock).toHaveBeenCalledWith({
			workspaceId: "team_mismatch",
			reservationId: "video_hold:req_mismatch",
			releaseRefId: "video_mismatch",
		});
		expect(recordUsageAndChargeMock).toHaveBeenCalledWith({
			requestId: "video_capture:video_mismatch",
			workspaceId: "team_mismatch",
			cost_nanos: 200_000_000,
		});
		expect(markVideoJobBilledMock).toHaveBeenCalledWith("team_mismatch", "video_mismatch");
		expect(setVideoJobStatusMock).toHaveBeenCalledWith(
			"team_mismatch",
			"video_mismatch",
			"completed",
			expect.objectContaining({
				charged: true,
				costNanos: 200_000_000,
				costUsd: 0.2,
				billingReason: "released_and_charged_actual",
				reservationStatus: "released_and_charged_actual",
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

	it("keeps mismatched-reservation completed videos unbilled when release throws", async () => {
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
		releaseWalletReservationMock.mockRejectedValue(new Error("release_timeout"));

		const result = await finalizeVideoJob({
			workspaceId: "team_release_failed",
			videoId: "video_release_failed",
			providerId: "openai",
			status: "completed",
			model: "openai/sora-2",
			seconds: 4,
		});

		expect(result).toEqual({
			status: "completed",
			charged: false,
			pricedUsage: { pricing: { total_nanos: 200_000_000 } },
			reason: "release_failed",
		});
		expect(recordUsageAndChargeMock).not.toHaveBeenCalled();
		expect(markVideoJobBilledMock).not.toHaveBeenCalled();
		expect(setVideoJobStatusMock).toHaveBeenCalledWith(
			"team_release_failed",
			"video_release_failed",
			"completed",
			expect.objectContaining({
				charged: false,
				billingReason: "release_failed",
				reservationStatus: "release_failed",
				pricedUsage: { pricing: { total_nanos: 200_000_000 } },
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
		expect(markVideoJobBilledMock).toHaveBeenCalledWith("team_2", "video_legacy_retry");
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
