// Purpose: Reconcile pending async video jobs against upstream providers.
// Why: Webhook delivery is best-effort, so polling safety net is required.
// How: Poll pending jobs, update status, and finalize completion billing exactly-once.

import { fetchVideoProviderStatus } from "@core/video-reconciliation";
import { finalizeVideoJob } from "@core/video-finalization";
import { listPendingVideoJobs } from "@core/video-jobs";
import { buildVideoPricingRequestOptions } from "@core/video-request-options";
import { dispatchVideoWebhookEventInBackground } from "@core/video-user-webhooks";

export type VideoReconciliationSummary = {
	startedAt: string;
	finishedAt: string;
	jobsScanned: number;
	jobsPolled: number;
	jobsUpdated: number;
	jobsCompleted: number;
	jobsFailed: number;
	jobsCancelled: number;
	jobsExpired: number;
	jobsCharged: number;
	jobsErrored: number;
};

function isTerminalStatus(status: string): status is "completed" | "failed" | "cancelled" | "expired" {
	return status === "completed" || status === "failed" || status === "cancelled" || status === "expired";
}

function videoWebhookEventForStatus(
	status: "completed" | "failed" | "cancelled" | "expired",
): "video.completed" | "video.failed" | "video.cancelled" | "video.expired" {
	if (status === "completed") return "video.completed";
	if (status === "cancelled") return "video.cancelled";
	if (status === "expired") return "video.expired";
	return "video.failed";
}

export async function runVideoReconciliationJob(args?: {
	limit?: number;
	concurrency?: number;
}): Promise<VideoReconciliationSummary> {
	const startedAt = new Date().toISOString();
	const jobs = await listPendingVideoJobs(args?.limit ?? 100);
	const maxConcurrency = Math.max(1, Math.min(12, Math.trunc(args?.concurrency ?? 4)));

	const processJob = async (job: Awaited<ReturnType<typeof listPendingVideoJobs>>[number]) => {
		const counts = {
			jobsPolled: 0,
			jobsUpdated: 0,
			jobsCompleted: 0,
			jobsFailed: 0,
			jobsCancelled: 0,
			jobsExpired: 0,
			jobsCharged: 0,
			jobsErrored: 0,
		};
		try {
			const currentStatus = String(job.status ?? "").toLowerCase();
			if (isTerminalStatus(currentStatus)) {
				const finalized = await finalizeVideoJob({
					workspaceId: job.workspaceId,
					videoId: job.videoId,
					providerId: String(job.provider ?? job.meta?.provider ?? ""),
					status: currentStatus,
					model: job.model ?? job.meta?.model,
					seconds: job.meta?.seconds ?? null,
					requestOptions: buildVideoPricingRequestOptions({
						resolution: job.meta?.resolution,
						quality: job.meta?.quality,
					}),
					isByok: job.meta?.keySource === "byok",
					metaPatch: {
						lastReconciledAt: new Date().toISOString(),
						reconciledFromStatus: currentStatus,
					},
				});
				const finalizedStatus = String(finalized.status ?? currentStatus).toLowerCase();
				if (isTerminalStatus(finalizedStatus) && finalizedStatus !== currentStatus) {
					dispatchVideoWebhookEventInBackground({
						workspaceId: job.workspaceId,
						videoId: job.videoId,
						eventType: videoWebhookEventForStatus(finalizedStatus),
					});
				}
				counts.jobsUpdated += 1;
				if (finalizedStatus === "completed") counts.jobsCompleted += 1;
				if (finalizedStatus === "failed") counts.jobsFailed += 1;
				if (finalizedStatus === "cancelled") counts.jobsCancelled += 1;
				if (finalizedStatus === "expired") counts.jobsExpired += 1;
				if (finalized.charged) counts.jobsCharged += 1;
				return counts;
			}

			const polled = await fetchVideoProviderStatus(job);
			if (!polled) return counts;
			counts.jobsPolled += 1;
			const polledProgress = typeof polled.progress === "number"
				? Math.max(0, Math.min(100, Math.round(polled.progress)))
				: null;
			const polledAt = new Date().toISOString();
			const finalized = await finalizeVideoJob({
				workspaceId: job.workspaceId,
				videoId: job.videoId,
				providerId: polled.providerId,
				status: polled.status,
				model: polled.model ?? job.model,
				seconds: polled.seconds ?? job.meta?.seconds ?? null,
				requestOptions: polled.requestOptions,
				isByok: job.meta?.keySource === "byok",
				metaPatch: {
					...(polled.metaPatch ?? {}),
					...(polledProgress != null ? { progress: polledProgress, progressSource: "provider" } : {}),
					lastPolledAt: polledAt,
					polledStatus: polled.status,
					lastReconciledAt: polledAt,
				},
			});
			if (finalized.status === "in_progress" && polled.status === "in_progress" && polledProgress != null) {
				dispatchVideoWebhookEventInBackground({
					workspaceId: job.workspaceId,
					videoId: job.videoId,
					eventType: "video.progress",
					progress: polledProgress,
				});
			}
			if (finalized.status === "completed") {
				dispatchVideoWebhookEventInBackground({
					workspaceId: job.workspaceId,
					videoId: job.videoId,
					eventType: "video.completed",
				});
			}
			if (finalized.status === "failed") {
				dispatchVideoWebhookEventInBackground({
					workspaceId: job.workspaceId,
					videoId: job.videoId,
					eventType: "video.failed",
				});
			}
			if (finalized.status === "cancelled") {
				dispatchVideoWebhookEventInBackground({
					workspaceId: job.workspaceId,
					videoId: job.videoId,
					eventType: "video.cancelled",
				});
			}
			if (finalized.status === "expired") {
				dispatchVideoWebhookEventInBackground({
					workspaceId: job.workspaceId,
					videoId: job.videoId,
					eventType: "video.expired",
				});
			}

			counts.jobsUpdated += 1;
			if (finalized.status === "completed") counts.jobsCompleted += 1;
			if (finalized.status === "failed") counts.jobsFailed += 1;
			if (finalized.status === "cancelled") counts.jobsCancelled += 1;
			if (finalized.status === "expired") counts.jobsExpired += 1;
			if (finalized.charged) counts.jobsCharged += 1;
		} catch (error) {
			counts.jobsErrored += 1;
			console.error("video_reconcile_job_failed", {
				error,
				workspaceId: job.workspaceId,
				videoId: job.videoId,
				provider: job.provider,
			});
		}
		return counts;
	};

	const aggregates = {
		jobsPolled: 0,
		jobsUpdated: 0,
		jobsCompleted: 0,
		jobsFailed: 0,
		jobsCancelled: 0,
		jobsExpired: 0,
		jobsCharged: 0,
		jobsErrored: 0,
	};

	if (jobs.length > 0) {
		let index = 0;
		const workerCount = Math.min(maxConcurrency, jobs.length);
		const workers = Array.from({ length: workerCount }, async () => {
			while (true) {
				const currentIndex = index;
				index += 1;
				if (currentIndex >= jobs.length) return;
				const job = jobs[currentIndex];
				if (!job) return;
				const result = await processJob(job);
				aggregates.jobsPolled += result.jobsPolled;
				aggregates.jobsUpdated += result.jobsUpdated;
				aggregates.jobsCompleted += result.jobsCompleted;
				aggregates.jobsFailed += result.jobsFailed;
				aggregates.jobsCancelled += result.jobsCancelled;
				aggregates.jobsExpired += result.jobsExpired;
				aggregates.jobsCharged += result.jobsCharged;
				aggregates.jobsErrored += result.jobsErrored;
			}
		});
		await Promise.all(workers);
	}

	return {
		startedAt,
		finishedAt: new Date().toISOString(),
		jobsScanned: jobs.length,
		jobsPolled: aggregates.jobsPolled,
		jobsUpdated: aggregates.jobsUpdated,
		jobsCompleted: aggregates.jobsCompleted,
		jobsFailed: aggregates.jobsFailed,
		jobsCancelled: aggregates.jobsCancelled,
		jobsExpired: aggregates.jobsExpired,
		jobsCharged: aggregates.jobsCharged,
		jobsErrored: aggregates.jobsErrored,
	};
}
