import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	finalizeVideoJob: vi.fn(),
	dispatchVideoWebhookEventInBackground: vi.fn(),
}));

vi.mock("@core/video-finalization", () => ({
	finalizeVideoJob: (...args: unknown[]) => mocks.finalizeVideoJob(...args),
}));

vi.mock("@core/video-user-webhooks", () => ({
	dispatchVideoWebhookEventInBackground: (...args: unknown[]) =>
		mocks.dispatchVideoWebhookEventInBackground(...args),
}));

import {
	mapAtlasVideoStatus,
	mapBytedanceVideoStatus,
	mapGoogleOperationErrorToVideoStatus,
	mapOpenAiVideoStatus,
	mapRunwayVideoStatus,
	finalizeVideoStatusIfTerminal,
	normalizeVideoStatus,
	normalizeVideoStatusFilter,
	parseVideoListStatuses,
} from "./status";
import {
	mapMiniMaxVideoStatus,
	mapXAiVideoStatus,
} from "./providers";

describe("video status helpers", () => {
	beforeEach(() => {
		mocks.finalizeVideoJob.mockReset();
		mocks.dispatchVideoWebhookEventInBackground.mockReset();
		mocks.finalizeVideoJob.mockImplementation(async (args: any) => ({
			status: args.status,
			charged: false,
			reason: "test",
		}));
	});

	it("normalizes public video statuses for list responses", () => {
		expect(normalizeVideoStatus("pending")).toBe("processing");
		expect(normalizeVideoStatus("in_progress")).toBe("processing");
		expect(normalizeVideoStatus("completed")).toBe("completed");
		expect(normalizeVideoStatus("cancelled")).toBe("cancelled");
		expect(normalizeVideoStatus("expired")).toBe("expired");
	});

	it("accepts public filter values for the video lifecycle", () => {
		expect(normalizeVideoStatusFilter("queued")).toBe("queued");
		expect(normalizeVideoStatusFilter("processing")).toBe("processing");
		expect(normalizeVideoStatusFilter("completed")).toBe("completed");
		expect(normalizeVideoStatusFilter("failed")).toBe("failed");
		expect(normalizeVideoStatusFilter("cancelled")).toBe("cancelled");
		expect(normalizeVideoStatusFilter("expired")).toBe("expired");
	});

	it("expands list filters to match stored internal aliases", () => {
		const url = new URL("https://api.phaseo.ai/v1/videos?status=processing,cancelled,expired");
		expect(parseVideoListStatuses(url)).toEqual([
			"processing",
			"in_progress",
			"running",
			"cancelled",
			"canceled",
			"expired",
		]);
	});

	it("preserves provider cancelled and expired states for direct status polling", () => {
		expect(mapOpenAiVideoStatus("cancelled")).toBe("cancelled");
		expect(mapOpenAiVideoStatus("expired")).toBe("expired");
		expect(mapBytedanceVideoStatus("canceled")).toBe("cancelled");
		expect(mapBytedanceVideoStatus("expired")).toBe("expired");
		expect(mapRunwayVideoStatus("cancelled")).toBe("cancelled");
		expect(mapRunwayVideoStatus("expired")).toBe("expired");
		expect(mapAtlasVideoStatus("canceled")).toBe("cancelled");
		expect(mapAtlasVideoStatus("expired")).toBe("expired");
		expect(mapMiniMaxVideoStatus("cancelled")).toBe("cancelled");
		expect(mapMiniMaxVideoStatus("expired")).toBe("expired");
		expect(mapXAiVideoStatus("canceled")).toBe("cancelled");
		expect(mapXAiVideoStatus("expired")).toBe("expired");
	});

	it("maps google operation cancellation errors to cancelled lifecycle", () => {
		expect(mapGoogleOperationErrorToVideoStatus({ code: 1 })).toBe("cancelled");
		expect(mapGoogleOperationErrorToVideoStatus({ status: "CANCELLED" })).toBe("cancelled");
		expect(mapGoogleOperationErrorToVideoStatus({ status: "FAILED" })).toBe("failed");
	});

	it("dispatches terminal polling webhooks using the finalized status", async () => {
		mocks.finalizeVideoJob.mockResolvedValueOnce({
			status: "failed",
			charged: false,
			reason: "already_terminal",
		});

		await finalizeVideoStatusIfTerminal({
			auth: {
				requestId: "req_video_status_test",
				workspaceId: "ws_video_status_test",
				apiKeyId: "key_video_status_test",
				apiKeyRef: null,
				apiKeyKid: null,
			},
			videoId: "video_status_test",
			videoMeta: {
				provider: "openai",
				model: "openai/sora-2",
				seconds: 5,
				resolution: "720p",
				quality: "standard",
			},
			providerId: "openai",
			status: "completed",
			model: "openai/sora-2",
			seconds: 5,
			resolution: "720p",
			quality: "standard",
		});

		expect(mocks.finalizeVideoJob).toHaveBeenCalledWith(expect.objectContaining({
			workspaceId: "ws_video_status_test",
			videoId: "video_status_test",
			status: "completed",
		}));
		expect(mocks.dispatchVideoWebhookEventInBackground).toHaveBeenCalledWith({
			workspaceId: "ws_video_status_test",
			videoId: "video_status_test",
			eventType: "video.failed",
		});
	});

	it("does not dispatch terminal polling webhooks when video finalization fails", async () => {
		mocks.finalizeVideoJob.mockRejectedValueOnce(new Error("wallet capture unavailable"));

		await expect(finalizeVideoStatusIfTerminal({
			auth: {
				requestId: "req_video_status_finalize_failed",
				workspaceId: "ws_video_status_finalize_failed",
				apiKeyId: "key_video_status_finalize_failed",
				apiKeyRef: null,
				apiKeyKid: null,
			},
			videoId: "video_status_finalize_failed",
			videoMeta: {
				provider: "openai",
				model: "openai/sora-2",
				seconds: 5,
				resolution: "720p",
				quality: "standard",
			},
			providerId: "openai",
			status: "completed",
			model: "openai/sora-2",
			seconds: 5,
			resolution: "720p",
			quality: "standard",
		})).rejects.toThrow("wallet capture unavailable");

		expect(mocks.finalizeVideoJob).toHaveBeenCalledWith(expect.objectContaining({
			workspaceId: "ws_video_status_finalize_failed",
			videoId: "video_status_finalize_failed",
			status: "completed",
		}));
		expect(mocks.dispatchVideoWebhookEventInBackground).not.toHaveBeenCalled();
	});
});
