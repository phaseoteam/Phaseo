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
	jobsCharged: number;
	jobsErrored: number;
};

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
			jobsCharged: 0,
			jobsErrored: 0,
		};
		try {
			const currentStatus = String(job.status ?? "").toLowerCase();
			if (currentStatus === "completed") {
				const finalized = await finalizeVideoJob({
					workspaceId: job.workspaceId,
					videoId: job.videoId,
					providerId: String(job.provider ?? job.meta?.provider ?? ""),
					status: "completed",
					model: job.model ?? job.meta?.model,
					seconds: job.meta?.seconds ?? null,
					requestOptions: buildVideoPricingRequestOptions({
						resolution: job.meta?.resolution,
						quality: job.meta?.quality,
					}),
					isByok: job.meta?.keySource === "byok",
					metaPatch: {
						lastReconciledAt: new Date().toISOString(),
						reconciledFromStatus: "completed",
					},
				});
				dispatchVideoWebhookEventInBackground({
					workspaceId: job.workspaceId,
					videoId: job.videoId,
					eventType: "video.completed",
				});
				counts.jobsUpdated += 1;
				counts.jobsCompleted += 1;
				if (finalized.charged) counts.jobsCharged += 1;
				return counts;
			}
			if (currentStatus === "failed") {
				const finalized = await finalizeVideoJob({
					workspaceId: job.workspaceId,
					videoId: job.videoId,
					providerId: String(job.provider ?? job.meta?.provider ?? ""),
					status: "failed",
					model: job.model ?? job.meta?.model,
					seconds: job.meta?.seconds ?? null,
					requestOptions: buildVideoPricingRequestOptions({
						resolution: job.meta?.resolution,
						quality: job.meta?.quality,
					}),
					isByok: job.meta?.keySource === "byok",
					metaPatch: {
						lastReconciledAt: new Date().toISOString(),
						reconciledFromStatus: "failed",
					},
				});
				dispatchVideoWebhookEventInBackground({
					workspaceId: job.workspaceId,
					videoId: job.videoId,
					eventType: "video.failed",
				});
				counts.jobsUpdated += 1;
				counts.jobsFailed += 1;
				if (finalized.charged) counts.jobsCharged += 1;
				return counts;
			}

			const polled = await fetchVideoProviderStatus(job);
			if (!polled) return counts;
			counts.jobsPolled += 1;
			if (polled.status === "in_progress" && typeof polled.progress === "number") {
				dispatchVideoWebhookEventInBackground({
					workspaceId: job.workspaceId,
					videoId: job.videoId,
					eventType: "video.progress",
					progress: polled.progress,
				});
			}

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
					lastReconciledAt: new Date().toISOString(),
				},
			});
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

			counts.jobsUpdated += 1;
			if (finalized.status === "completed") counts.jobsCompleted += 1;
			if (finalized.status === "failed") counts.jobsFailed += 1;
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
		jobsCharged: aggregates.jobsCharged,
		jobsErrored: aggregates.jobsErrored,
	};
}
