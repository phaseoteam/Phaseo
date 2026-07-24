import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchVideoProviderStatusMock = vi.fn();
const finalizeVideoJobMock = vi.fn();
const listPendingVideoJobsMock = vi.fn();
const updateVideoJobReconciliationMock = vi.fn();
const dispatchVideoWebhookEventInBackgroundMock = vi.fn();

vi.mock("@core/video-reconciliation", () => ({
	fetchVideoProviderStatus: (...args: unknown[]) => fetchVideoProviderStatusMock(...args),
}));

vi.mock("@core/video-finalization", () => ({
	finalizeVideoJob: (...args: unknown[]) => finalizeVideoJobMock(...args),
}));

vi.mock("@core/video-jobs", () => ({
	listPendingVideoJobs: (...args: unknown[]) => listPendingVideoJobsMock(...args),
	updateVideoJobReconciliation: (...args: unknown[]) => updateVideoJobReconciliationMock(...args),
}));

vi.mock("@core/video-user-webhooks", () => ({
	dispatchVideoWebhookEventInBackground: (...args: unknown[]) => dispatchVideoWebhookEventInBackgroundMock(...args),
}));

import { runVideoReconciliationJob } from "./video-reconciliation";

function makeJob(overrides: Record<string, unknown>) {
	return {
		workspaceId: "ws_video_reconcile",
		videoId: "video_123",
		requestId: "req_video_123",
		sessionId: null,
		appId: null,
		nativeId: "native_video_123",
		provider: "runway",
		model: "runway/gen4_turbo",
		status: "in_progress",
		billedAt: null,
		meta: {
			provider: "runway",
			model: "runway/gen4_turbo",
			seconds: 5,
			resolution: "720p",
			quality: "standard",
			reservationId: "video_hold:video_123",
			reservedNanos: 100_000_000,
			reservationStatus: "held",
		},
		updatedAt: null,
		createdAt: null,
		...overrides,
	};
}

describe("runVideoReconciliationJob", () => {
	beforeEach(() => {
		fetchVideoProviderStatusMock.mockReset();
		finalizeVideoJobMock.mockReset();
		listPendingVideoJobsMock.mockReset();
		updateVideoJobReconciliationMock.mockReset().mockResolvedValue(undefined);
		dispatchVideoWebhookEventInBackgroundMock.mockReset();
	});

	it("finalizes provider-cancelled jobs with the cancelled lifecycle and webhook event", async () => {
		const operationLog: string[] = [];
		listPendingVideoJobsMock.mockResolvedValue([makeJob({ videoId: "video_cancel_polled" })]);
		fetchVideoProviderStatusMock.mockResolvedValue({
			status: "cancelled",
			providerId: "runway",
			model: "runway/gen4_turbo",
			seconds: 5,
			requestOptions: { resolution: "720p", quality: "standard" },
			metaPatch: { providerTaskId: "native_video_123" },
		});
		finalizeVideoJobMock.mockImplementation(async (args) => {
			operationLog.push(`finalize:${args.videoId}:${args.status}`);
			return { status: "cancelled", charged: false, reason: "released" };
		});
		dispatchVideoWebhookEventInBackgroundMock.mockImplementation((args) => {
			operationLog.push(`webhook:${args.videoId}:${args.eventType}`);
		});

		const summary = await runVideoReconciliationJob({ limit: 10, concurrency: 1 });

		expect(fetchVideoProviderStatusMock).toHaveBeenCalledTimes(1);
		expect(finalizeVideoJobMock).toHaveBeenCalledWith(expect.objectContaining({
			workspaceId: "ws_video_reconcile",
			videoId: "video_cancel_polled",
			providerId: "runway",
			status: "cancelled",
			metaPatch: expect.objectContaining({
				lastPolledAt: expect.any(String),
				polledStatus: "cancelled",
				lastReconciledAt: expect.any(String),
			}),
		}));
		expect(dispatchVideoWebhookEventInBackgroundMock).toHaveBeenCalledWith({
			workspaceId: "ws_video_reconcile",
			videoId: "video_cancel_polled",
			eventType: "video.cancelled",
		});
		expect(operationLog).toEqual([
			"finalize:video_cancel_polled:cancelled",
			"webhook:video_cancel_polled:video.cancelled",
		]);
		expect(summary).toMatchObject({
			jobsScanned: 1,
			jobsPolled: 1,
			jobsCancelled: 1,
			jobsExpired: 0,
			jobsCharged: 0,
		});
	});

	it("finalizes already-cancelled unbilled jobs without polling upstream", async () => {
		listPendingVideoJobsMock.mockResolvedValue([makeJob({
			videoId: "video_cancel_stored",
			status: "cancelled",
		})]);
		finalizeVideoJobMock.mockResolvedValue({ status: "cancelled", charged: false, reason: "released" });

		const summary = await runVideoReconciliationJob({ limit: 10, concurrency: 1 });

		expect(fetchVideoProviderStatusMock).not.toHaveBeenCalled();
		expect(finalizeVideoJobMock).toHaveBeenCalledWith(expect.objectContaining({
			workspaceId: "ws_video_reconcile",
			videoId: "video_cancel_stored",
			status: "cancelled",
			metaPatch: expect.objectContaining({
				reconciledFromStatus: "cancelled",
			}),
		}));
		expect(dispatchVideoWebhookEventInBackgroundMock).not.toHaveBeenCalled();
		expect(summary.jobsCancelled).toBe(1);
	});

	it("uses the finalized status for already-terminal video records", async () => {
		listPendingVideoJobsMock.mockResolvedValue([makeJob({
			videoId: "video_stale_terminal",
			status: "completed",
		})]);
		finalizeVideoJobMock.mockResolvedValue({ status: "failed", charged: false, reason: "stale_terminal_status" });

		const summary = await runVideoReconciliationJob({ limit: 10, concurrency: 1 });

		expect(fetchVideoProviderStatusMock).not.toHaveBeenCalled();
		expect(finalizeVideoJobMock).toHaveBeenCalledWith(expect.objectContaining({
			workspaceId: "ws_video_reconcile",
			videoId: "video_stale_terminal",
			status: "completed",
		}));
		expect(dispatchVideoWebhookEventInBackgroundMock).toHaveBeenCalledWith({
			workspaceId: "ws_video_reconcile",
			videoId: "video_stale_terminal",
			eventType: "video.failed",
		});
		expect(summary).toMatchObject({
			jobsCompleted: 0,
			jobsFailed: 1,
			jobsCancelled: 0,
			jobsExpired: 0,
		});
	});

	it("dispatches progress webhooks from in-progress provider polling", async () => {
		const operationLog: string[] = [];
		listPendingVideoJobsMock.mockResolvedValue([makeJob({ videoId: "video_progress_polled" })]);
		fetchVideoProviderStatusMock.mockResolvedValue({
			status: "in_progress",
			providerId: "openai",
			model: "openai/sora",
			seconds: 8,
			progress: 42,
			requestOptions: { resolution: "720p", quality: "standard" },
			metaPatch: { providerTaskId: "native_video_progress" },
		});
		finalizeVideoJobMock.mockImplementation(async (args) => {
			operationLog.push(`finalize:${args.videoId}:${args.status}`);
			return { status: "in_progress", charged: false, reason: "not_terminal" };
		});
		dispatchVideoWebhookEventInBackgroundMock.mockImplementation((args) => {
			operationLog.push(`webhook:${args.videoId}:${args.eventType}`);
		});

		const summary = await runVideoReconciliationJob({ limit: 10, concurrency: 1 });

		expect(fetchVideoProviderStatusMock).toHaveBeenCalledTimes(1);
		expect(finalizeVideoJobMock).toHaveBeenCalledWith(expect.objectContaining({
			workspaceId: "ws_video_reconcile",
			videoId: "video_progress_polled",
			providerId: "openai",
			status: "in_progress",
			model: "openai/sora",
			seconds: 8,
			requestOptions: { resolution: "720p", quality: "standard" },
			metaPatch: expect.objectContaining({
				providerTaskId: "native_video_progress",
				progress: 42,
				progressSource: "provider",
				lastPolledAt: expect.any(String),
				polledStatus: "in_progress",
				lastReconciledAt: expect.any(String),
			}),
		}));
		expect(dispatchVideoWebhookEventInBackgroundMock).toHaveBeenCalledTimes(1);
		expect(dispatchVideoWebhookEventInBackgroundMock).toHaveBeenCalledWith({
			workspaceId: "ws_video_reconcile",
			videoId: "video_progress_polled",
			eventType: "video.progress",
			progress: 42,
		});
		expect(operationLog).toEqual([
			"finalize:video_progress_polled:in_progress",
			"webhook:video_progress_polled:video.progress",
		]);
		expect(summary).toMatchObject({
			jobsScanned: 1,
			jobsPolled: 1,
			jobsUpdated: 1,
			jobsCompleted: 0,
			jobsFailed: 0,
			jobsCancelled: 0,
			jobsExpired: 0,
			jobsCharged: 0,
		});
	});

	it("does not dispatch progress webhooks when progress metadata persistence fails", async () => {
		listPendingVideoJobsMock.mockResolvedValue([makeJob({ videoId: "video_progress_store_failed" })]);
		fetchVideoProviderStatusMock.mockResolvedValue({
			status: "in_progress",
			providerId: "openai",
			model: "openai/sora",
			seconds: 8,
			progress: 67,
			requestOptions: { resolution: "720p", quality: "standard" },
			metaPatch: { providerTaskId: "native_video_progress_failed" },
		});
		finalizeVideoJobMock.mockRejectedValue(new Error("async operation store unavailable"));

		const summary = await runVideoReconciliationJob({ limit: 10, concurrency: 1 });

		expect(fetchVideoProviderStatusMock).toHaveBeenCalledTimes(1);
		expect(finalizeVideoJobMock).toHaveBeenCalledWith(expect.objectContaining({
			workspaceId: "ws_video_reconcile",
			videoId: "video_progress_store_failed",
			providerId: "openai",
			status: "in_progress",
			metaPatch: expect.objectContaining({
				providerTaskId: "native_video_progress_failed",
				progress: 67,
				progressSource: "provider",
				lastPolledAt: expect.any(String),
				polledStatus: "in_progress",
				lastReconciledAt: expect.any(String),
			}),
		}));
		expect(dispatchVideoWebhookEventInBackgroundMock).not.toHaveBeenCalled();
		expect(summary).toMatchObject({
			jobsScanned: 1,
			jobsPolled: 1,
			jobsUpdated: 0,
			jobsErrored: 1,
		});
	});

	it("finalizes expired jobs as expired and emits the expired webhook", async () => {
		const operationLog: string[] = [];
		listPendingVideoJobsMock.mockResolvedValue([makeJob({ videoId: "video_expired" })]);
		fetchVideoProviderStatusMock.mockResolvedValue({
			status: "expired",
			providerId: "x-ai",
			model: "x-ai/grok-imagine-video",
			seconds: 6,
			requestOptions: { resolution: "720p" },
		});
		finalizeVideoJobMock.mockImplementation(async (args) => {
			operationLog.push(`finalize:${args.videoId}:${args.status}`);
			return { status: "expired", charged: false, reason: "released" };
		});
		dispatchVideoWebhookEventInBackgroundMock.mockImplementation((args) => {
			operationLog.push(`webhook:${args.videoId}:${args.eventType}`);
		});

		const summary = await runVideoReconciliationJob({ limit: 10, concurrency: 1 });

		expect(finalizeVideoJobMock).toHaveBeenCalledWith(expect.objectContaining({
			videoId: "video_expired",
			providerId: "x-ai",
			status: "expired",
			metaPatch: expect.objectContaining({
				lastPolledAt: expect.any(String),
				polledStatus: "expired",
				lastReconciledAt: expect.any(String),
			}),
		}));
		expect(dispatchVideoWebhookEventInBackgroundMock).toHaveBeenCalledWith({
			workspaceId: "ws_video_reconcile",
			videoId: "video_expired",
			eventType: "video.expired",
		});
		expect(operationLog).toEqual([
			"finalize:video_expired:expired",
			"webhook:video_expired:video.expired",
		]);
		expect(summary).toMatchObject({
			jobsExpired: 1,
			jobsFailed: 0,
		});
	});
});
