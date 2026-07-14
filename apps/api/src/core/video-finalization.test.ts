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

	it("releases reservation on failed terminal status", async () => {
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
			status: "failed",
		});

		expect(result).toEqual({
			status: "failed",
			charged: false,
			reason: "released",
		});
		expect(recordUsageAndChargeMock).not.toHaveBeenCalled();
		expect(captureWalletReservationMock).not.toHaveBeenCalled();
		expect(markVideoJobBilledMock).toHaveBeenCalledWith("team_3", "video_3");
	});
});
