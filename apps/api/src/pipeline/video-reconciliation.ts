// Purpose: Reconcile pending async video jobs against upstream providers.
// Why: Webhook delivery is best-effort, so polling safety net is required.
// How: Poll pending jobs, update status, and finalize completion billing exactly-once.

import { fetchVideoProviderStatus } from "@core/video-reconciliation";
import { finalizeVideoJob } from "@core/video-finalization";
import { listPendingVideoJobs, updateVideoJobReconciliation, type VideoJobRecord } from "@core/video-jobs";
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

function nextIsoFromNow(delaySeconds: number): string {
	return new Date(Date.now() + Math.max(0, Math.trunc(delaySeconds)) * 1_000).toISOString();
}

function terminalVideoStatus(status: string | null | undefined): boolean {
	const normalized = String(status ?? "").toLowerCase();
	return normalized === "completed" || normalized === "failed" || normalized === "cancelled" || normalized === "expired";
}

function nextVideoReconcileAt(status: string | null | undefined, progress?: number | null): string | null {
	const normalized = String(status ?? "").toLowerCase();
	if (terminalVideoStatus(normalized)) return null;
	if (normalized === "in_progress" || normalized === "processing" || normalized === "running") {
		const nearCompletion = typeof progress === "number" && progress >= 0.8;
		return nextIsoFromNow(nearCompletion ? 15 : 30);
	}
	return nextIsoFromNow(60);
}

function nextVideoErrorRetryAt(job: VideoJobRecord): string {
	const attempts = Math.max(0, Math.min(7, Math.trunc(job.reconcileAttempts ?? 0)));
	const delaySeconds = Math.min(30 * 60, 60 * 2 ** attempts);
	return nextIsoFromNow(delaySeconds);
}

function reconcileErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function terminalVideoEvent(status: string): "video.completed" | "video.failed" | "video.cancelled" | "video.expired" | null {
	if (status === "completed") return "video.completed";
	if (status === "failed") return "video.failed";
	if (status === "cancelled") return "video.cancelled";
	if (status === "expired") return "video.expired";
	return null;
}

export async function runVideoReconciliationJob(args?: {
	limit?: number;
	concurrency?: number;
	workerId?: string;
	leaseSeconds?: number;
	shardCount?: number;
	shardIndex?: number;
}): Promise<VideoReconciliationSummary> {
	const startedAt = new Date().toISOString();
	const workerId = args?.workerId ?? `video-reconciler:${startedAt}`;
	const jobs = await listPendingVideoJobs(args?.limit ?? 100, {
		workerId,
		leaseSeconds: args?.leaseSeconds,
		shardCount: args?.shardCount,
		shardIndex: args?.shardIndex,
	});
	const maxConcurrency = Math.max(1, Math.min(64, Math.trunc(args?.concurrency ?? 4)));

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
			if (terminalVideoStatus(currentStatus)) {
				const finalized = await finalizeVideoJob({
					workspaceId: job.workspaceId,
					videoId: job.videoId,
					providerId: String(job.provider ?? job.meta?.provider ?? ""),
					status: currentStatus as "completed" | "failed" | "cancelled" | "expired",
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
				const eventType = terminalVideoEvent(finalized.status);
				if (eventType && currentStatus !== "cancelled" && currentStatus !== "expired") {
					dispatchVideoWebhookEventInBackground({
						workspaceId: job.workspaceId,
						videoId: job.videoId,
						eventType,
					});
				}
				await updateVideoJobReconciliation({
					workspaceId: job.workspaceId,
					videoId: job.videoId,
					nextReconcileAt: null,
					lastError: null,
				});
				counts.jobsUpdated += 1;
				if (finalized.status === "completed") counts.jobsCompleted += 1;
				if (finalized.status === "failed") counts.jobsFailed += 1;
				if (finalized.status === "cancelled") counts.jobsCancelled += 1;
				if (finalized.status === "expired") counts.jobsExpired += 1;
				if (finalized.charged) counts.jobsCharged += 1;
				return counts;
			}

			const polled = await fetchVideoProviderStatus(job);
			if (!polled) {
				await updateVideoJobReconciliation({
					workspaceId: job.workspaceId,
					videoId: job.videoId,
					nextReconcileAt: nextVideoReconcileAt(job.status),
					lastError: null,
				});
				return counts;
			}
			counts.jobsPolled += 1;
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
					...(typeof polled.progress === "number" ? {
						progress: polled.progress,
						progressSource: "provider",
					} : {}),
					lastPolledAt: polledAt,
					polledStatus: polled.status,
					lastReconciledAt: polledAt,
				},
			});
			if (finalized.status === "in_progress" && typeof polled.progress === "number") {
				dispatchVideoWebhookEventInBackground({
					workspaceId: job.workspaceId,
					videoId: job.videoId,
					eventType: "video.progress",
					progress: polled.progress,
				});
			}
			const eventType = terminalVideoEvent(finalized.status);
			if (eventType) {
				dispatchVideoWebhookEventInBackground({
					workspaceId: job.workspaceId,
					videoId: job.videoId,
					eventType,
				});
			}
			await updateVideoJobReconciliation({
				workspaceId: job.workspaceId,
				videoId: job.videoId,
				nextReconcileAt: nextVideoReconcileAt(finalized.status, polled.progress),
				lastError: null,
			});

			counts.jobsUpdated += 1;
			if (finalized.status === "completed") counts.jobsCompleted += 1;
			if (finalized.status === "failed") counts.jobsFailed += 1;
			if (finalized.status === "cancelled") counts.jobsCancelled += 1;
			if (finalized.status === "expired") counts.jobsExpired += 1;
			if (finalized.charged) counts.jobsCharged += 1;
		} catch (error) {
			counts.jobsErrored += 1;
			await updateVideoJobReconciliation({
				workspaceId: job.workspaceId,
				videoId: job.videoId,
				nextReconcileAt: nextVideoErrorRetryAt(job),
				lastError: reconcileErrorMessage(error),
			}).catch((updateError) => {
				console.error("video_reconcile_release_failed", {
					error: updateError,
					workspaceId: job.workspaceId,
					videoId: job.videoId,
				});
			});
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
