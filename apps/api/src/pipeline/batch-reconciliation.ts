import { dispatchAsyncWebhookEventInBackground } from "@core/async-notifications";
import {
	listPendingBatchJobs,
	resolveBatchProviderNativeId,
	saveBatchJobMeta,
	updateBatchJobReconciliation,
	type BatchJobRecord,
} from "@core/batch-jobs";
import { finalizeBatchJob, type FinalizeBatchJobResult } from "@core/batch-finalization";
import { releaseStaleOrphanBatchReservations } from "@core/wallet-reservations";
import {
	batchMetaFromProviderPayload,
	fetchProviderBatchStatus,
	OPENAI_BATCH_PROVIDER_ID,
	persistProviderBatchFileOwnership,
} from "@core/batch-provider-adapters";

export type BatchReconciliationSummary = {
	startedAt: string;
	finishedAt: string;
	jobsScanned: number;
	jobsPolled: number;
	jobsUpdated: number;
	jobsCompleted: number;
	jobsFailed: number;
	jobsCancelled: number;
	jobsErrored: number;
};

function nextIsoFromNow(delaySeconds: number): string {
	return new Date(Date.now() + Math.max(0, Math.trunc(delaySeconds)) * 1_000).toISOString();
}

function mapTerminalPhase(status: string): "completed" | "failed" | "cancelled" | null {
	switch (status) {
		case "completed":
			return "completed";
		case "failed":
		case "expired":
			return "failed";
		case "cancelled":
		case "canceled":
			return "cancelled";
		default:
			return null;
	}
}

function nextBatchReconcileAt(status: string | null | undefined): string | null {
	const normalized = String(status ?? "").toLowerCase();
	if (mapTerminalPhase(normalized)) return null;
	if (normalized === "finalizing" || normalized === "cancelling") return nextIsoFromNow(2 * 60);
	if (normalized === "in_progress") return nextIsoFromNow(5 * 60);
	return nextIsoFromNow(10 * 60);
}

function nextBatchErrorRetryAt(job: BatchJobRecord): string {
	const attempts = Math.max(0, Math.min(7, Math.trunc(job.reconcileAttempts ?? 0)));
	const delaySeconds = Math.min(30 * 60, 2 * 60 * 2 ** attempts);
	return nextIsoFromNow(delaySeconds);
}

function reconcileErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

const STALE_SUBMISSION_SECONDS = 15 * 60;

function isStaleSubmission(job: BatchJobRecord): boolean {
	const createdAt = Date.parse(job.createdAt ?? "");
	return Number.isFinite(createdAt) && Date.now() - createdAt >= STALE_SUBMISSION_SECONDS * 1_000;
}

function isBillingBlockedFinalization(result: FinalizeBatchJobResult): boolean {
	if (result.billed !== false) return false;
	return (
		result.reason === "missing_output_file" ||
		result.reason === "missing_usage" ||
		result.reason === "unpriced_successful_responses" ||
		result.reason === "missing_successful_output_rows" ||
		result.reason === "successful_output_count_mismatch" ||
		result.reason === "missing_model" ||
		result.reason === "price_card_missing"
		|| result.reason.startsWith("reservation_")
	);
}

export async function runBatchReconciliationJob(args?: {
	limit?: number;
	concurrency?: number;
	workerId?: string;
	leaseSeconds?: number;
	shardCount?: number;
	shardIndex?: number;
}): Promise<BatchReconciliationSummary> {
	const startedAt = new Date().toISOString();
	await releaseStaleOrphanBatchReservations({ limit: args?.limit ?? 100 }).catch((error) => {
		console.error("batch_orphan_reservation_reaper_failed", { error });
	});
	const workerId = args?.workerId ?? `batch-reconciler:${startedAt}`;
	const jobs = await listPendingBatchJobs(args?.limit ?? 100, {
		workerId,
		leaseSeconds: args?.leaseSeconds,
		shardCount: args?.shardCount,
		shardIndex: args?.shardIndex,
	});
	const maxConcurrency = Math.max(1, Math.min(64, Math.trunc(args?.concurrency ?? 4)));

	const aggregates = {
		jobsPolled: 0,
		jobsUpdated: 0,
		jobsCompleted: 0,
		jobsFailed: 0,
		jobsCancelled: 0,
		jobsErrored: 0,
	};

	const processJob = async (job: BatchJobRecord) => {
		const counts = {
			jobsPolled: 0,
			jobsUpdated: 0,
			jobsCompleted: 0,
			jobsFailed: 0,
			jobsCancelled: 0,
			jobsErrored: 0,
		};
		try {
			const providerId = job.provider ?? job.meta?.provider ?? OPENAI_BATCH_PROVIDER_ID;
			const currentStatus = String(job.status ?? job.meta?.status ?? "").toLowerCase();
			if (currentStatus === "submitting" && !job.nativeId && !job.meta?.nativeBatchId) {
				if (!isStaleSubmission(job)) {
					await updateBatchJobReconciliation({
						workspaceId: job.workspaceId,
						batchId: job.batchId,
						nextReconcileAt: nextIsoFromNow(STALE_SUBMISSION_SECONDS),
						lastError: null,
					});
					return counts;
				}
				await saveBatchJobMeta(job.workspaceId, job.batchId, {
					...(job.meta ?? { provider: providerId }),
					provider: providerId,
					status: "submission_unknown",
					reservationStatus: job.meta?.reservationStatus ?? null,
					billingReason: "manual_recovery_required_provider_id_unknown",
				});
				counts.jobsUpdated += 1;
				counts.jobsErrored += 1;
				console.error("batch_submission_outcome_unknown", {
					workspaceId: job.workspaceId,
					batchId: job.batchId,
					providerId,
					requestId: job.requestId,
					reservationId: job.meta?.reservationId ?? null,
				});
				return counts;
			}
			const nativeBatchId = resolveBatchProviderNativeId({
				batchId: job.batchId,
				nativeId: job.nativeId,
				meta: job.meta,
			});
			const payload = await fetchProviderBatchStatus(providerId, nativeBatchId);
			if (!payload) {
				await updateBatchJobReconciliation({
					workspaceId: job.workspaceId,
					batchId: job.batchId,
					nextReconcileAt: nextBatchReconcileAt(job.status ?? job.meta?.status),
					lastError: null,
				});
				return counts;
			}
			counts.jobsPolled += 1;
			const previousStatus = String(job.status ?? job.meta?.status ?? "").toLowerCase();
			const nextStatus = String(payload?.status ?? job.status ?? "").toLowerCase();
			await saveBatchJobMeta(
				job.workspaceId,
				job.batchId,
				batchMetaFromProviderPayload(payload, {
					...(job.meta ?? { provider: providerId }),
					provider: providerId,
				}),
			);
			await persistProviderBatchFileOwnership(job.workspaceId, providerId, payload);
			counts.jobsUpdated += 1;
			const phase = mapTerminalPhase(nextStatus);
			let finalization: FinalizeBatchJobResult | null = null;
			if (phase) {
				finalization = await finalizeBatchJob({
					workspaceId: job.workspaceId,
					batchId: job.batchId,
					status: nextStatus,
				});
			}
			if (finalization && isBillingBlockedFinalization(finalization)) {
				counts.jobsErrored += 1;
				await updateBatchJobReconciliation({
					workspaceId: job.workspaceId,
					batchId: job.batchId,
					nextReconcileAt: nextBatchErrorRetryAt(job),
					lastError: `batch_billing_blocked:${finalization.reason}`,
				});
				return counts;
			}
			if (phase && nextStatus !== previousStatus) {
				dispatchAsyncWebhookEventInBackground({
					workspaceId: job.workspaceId,
					kind: "batch",
					internalId: job.batchId,
					phase,
				});
				if (phase === "completed") counts.jobsCompleted += 1;
				if (phase === "failed") counts.jobsFailed += 1;
				if (phase === "cancelled") counts.jobsCancelled += 1;
			}
			await updateBatchJobReconciliation({
				workspaceId: job.workspaceId,
				batchId: job.batchId,
				nextReconcileAt: nextBatchReconcileAt(nextStatus),
				lastError: null,
			});
		} catch (error) {
			counts.jobsErrored += 1;
			await updateBatchJobReconciliation({
				workspaceId: job.workspaceId,
				batchId: job.batchId,
				nextReconcileAt: nextBatchErrorRetryAt(job),
				lastError: reconcileErrorMessage(error),
			}).catch((updateError) => {
				console.error("batch_reconcile_release_failed", {
					error: updateError,
					workspaceId: job.workspaceId,
					batchId: job.batchId,
				});
			});
			console.error("batch_reconcile_job_failed", {
				error,
				workspaceId: job.workspaceId,
				batchId: job.batchId,
				provider: job.provider,
			});
		}
		return counts;
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
		jobsErrored: aggregates.jobsErrored,
	};
}
