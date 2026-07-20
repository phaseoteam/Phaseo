import { dispatchAsyncWebhookEventInBackground } from "@core/async-notifications";
import {
	listPendingBatchJobs,
	markBatchJobBilled,
	resolveBatchProviderNativeId,
	saveBatchJobMeta,
	setBatchJobStatus,
	updateBatchJobReconciliation,
	type BatchJobRecord,
} from "@core/batch-jobs";
import { finalizeBatchJob, type FinalizeBatchJobResult } from "@core/batch-finalization";
import { releaseStaleOrphanBatchReservations } from "@core/wallet-reservations";
import {
	batchMetaFromProviderPayload,
	fetchProviderBatchStatus,
	findProviderBatchByGatewayMetadata,
	OPENAI_BATCH_PROVIDER_ID,
	persistProviderBatchFileOwnership,
	ProviderBatchFetchError,
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
const LEGACY_TERMINAL_NOT_FOUND_MIN_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const TERMINAL_NOT_FOUND_SLOW_RETRY_SECONDS = 24 * 60 * 60;

function isStaleSubmission(job: BatchJobRecord): boolean {
	const createdAt = Date.parse(job.createdAt ?? "");
	return Number.isFinite(createdAt) && Date.now() - createdAt >= STALE_SUBMISSION_SECONDS * 1_000;
}

function shouldFinalizeTerminalWithoutProviderPoll(
	job: BatchJobRecord,
	phase: "completed" | "failed" | "cancelled",
	nativeBatchId: string,
): boolean {
	if (!nativeBatchId) return true;
	if (phase === "completed") return false;
	if ((job.meta?.requestCounts?.completed ?? 0) > 0) return false;
	if (String(job.meta?.outputFileId ?? "").trim()) return false;
	return (
		job.meta?.requestCounts?.completed === 0 ||
		job.meta?.reservationStatus === "released" ||
		job.meta?.submissionOutcome === "rejected"
	);
}

function canRetireLegacyTerminalNotFound(job: BatchJobRecord, error: unknown): boolean {
	if (!(error instanceof ProviderBatchFetchError) || error.status !== 404) return false;
	if (!mapTerminalPhase(String(job.status ?? job.meta?.status ?? "").toLowerCase())) return false;
	if (job.meta?.reservationId) return false;
	if (job.meta?.charged !== false) return false;
	const createdAt = Date.parse(job.createdAt ?? "");
	return Number.isFinite(createdAt) && Date.now() - createdAt >= LEGACY_TERMINAL_NOT_FOUND_MIN_AGE_MS;
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
		|| result.reason === "settlement_failed"
		|| result.reason === "release_failed"
		|| result.reason === "key_usage_persistence_failed"
		|| result.reason.startsWith("settlement_not_applied:")
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
		const providerId = job.provider ?? job.meta?.provider ?? OPENAI_BATCH_PROVIDER_ID;
		const currentStatus = String(job.status ?? job.meta?.status ?? "").toLowerCase();
		try {
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
			let existingNativeBatchId = String(job.nativeId ?? job.meta?.nativeBatchId ?? "").trim();
			if (currentStatus === "submission_unknown" && !existingNativeBatchId) {
				const recovered = await findProviderBatchByGatewayMetadata({
					providerId,
					batchId: job.batchId,
					requestId: job.requestId,
				});
				const recoveredNativeId = String(recovered?.native_batch_id ?? recovered?.id ?? "").trim();
				if (!recoveredNativeId) {
					await updateBatchJobReconciliation({
						workspaceId: job.workspaceId,
						batchId: job.batchId,
						nextReconcileAt: nextBatchErrorRetryAt(job),
						lastError: "batch_submission_recovery_not_found",
					});
					counts.jobsErrored += 1;
					return counts;
				}
				existingNativeBatchId = recoveredNativeId;
				await saveBatchJobMeta(job.workspaceId, job.batchId, batchMetaFromProviderPayload(recovered, {
					...(job.meta ?? { provider: providerId }),
					provider: providerId,
					nativeBatchId: recoveredNativeId,
					submissionOutcome: "accepted",
					submissionError: null,
				}));
				counts.jobsUpdated += 1;
			}
			const existingTerminalPhase = mapTerminalPhase(currentStatus);
			if (
				existingTerminalPhase &&
				shouldFinalizeTerminalWithoutProviderPoll(job, existingTerminalPhase, existingNativeBatchId)
			) {
				const finalization = await finalizeBatchJob({
					workspaceId: job.workspaceId,
					batchId: job.batchId,
					status: currentStatus,
				});
				if (isBillingBlockedFinalization(finalization)) {
					counts.jobsErrored += 1;
					await updateBatchJobReconciliation({
						workspaceId: job.workspaceId,
						batchId: job.batchId,
						nextReconcileAt: nextBatchErrorRetryAt(job),
						lastError: `batch_billing_blocked:${finalization.reason}`,
					});
					return counts;
				}
				if (finalization.billed) {
					dispatchAsyncWebhookEventInBackground({
						workspaceId: job.workspaceId,
						kind: "batch",
						internalId: job.batchId,
						phase: existingTerminalPhase,
					});
					if (existingTerminalPhase === "completed") counts.jobsCompleted += 1;
					if (existingTerminalPhase === "failed") counts.jobsFailed += 1;
					if (existingTerminalPhase === "cancelled") counts.jobsCancelled += 1;
				}
				await updateBatchJobReconciliation({
					workspaceId: job.workspaceId,
					batchId: job.batchId,
					nextReconcileAt: null,
					lastError: null,
				});
				counts.jobsUpdated += 1;
				return counts;
			}
			const nativeBatchId = existingNativeBatchId || resolveBatchProviderNativeId({
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
			let reconciliationError = error;
			if (canRetireLegacyTerminalNotFound(job, error)) {
				try {
					const finalizedAt = new Date().toISOString();
					await setBatchJobStatus(job.workspaceId, job.batchId, currentStatus, {
						charged: false,
						billingReason: "legacy_provider_resource_not_found_no_reservation",
						finalizedAt,
						providerResultUnavailableAt: finalizedAt,
					});
					const marked = await markBatchJobBilled(job.workspaceId, job.batchId);
					if (!marked) throw new Error("legacy_terminal_mark_billed_not_applied");
					counts.jobsUpdated += 1;
					console.warn("batch_reconcile_legacy_terminal_retired", {
						error: reconcileErrorMessage(error),
						workspaceId: job.workspaceId,
						batchId: job.batchId,
						provider: providerId,
						status: currentStatus,
					});
					return counts;
				} catch (retirementError) {
					reconciliationError = new AggregateError(
						[error, retirementError],
						"legacy_terminal_retirement_failed",
					);
				}
			}
			counts.jobsErrored += 1;
			const errorMessage = reconcileErrorMessage(reconciliationError);
			const terminalNotFound = error instanceof ProviderBatchFetchError
				&& error.status === 404
				&& Boolean(mapTerminalPhase(currentStatus));
			await updateBatchJobReconciliation({
				workspaceId: job.workspaceId,
				batchId: job.batchId,
				nextReconcileAt: terminalNotFound
					? nextIsoFromNow(TERMINAL_NOT_FOUND_SLOW_RETRY_SECONDS)
					: nextBatchErrorRetryAt(job),
				lastError: errorMessage,
			}).catch((updateError) => {
				console.error("batch_reconcile_release_failed", {
					error: reconcileErrorMessage(updateError),
					workspaceId: job.workspaceId,
					batchId: job.batchId,
				});
			});
			console.error("batch_reconcile_job_failed", {
				error: errorMessage,
				errorName: reconciliationError instanceof Error ? reconciliationError.name : typeof reconciliationError,
				providerStatus: error instanceof ProviderBatchFetchError ? error.status : null,
				workspaceId: job.workspaceId,
				batchId: job.batchId,
				provider: providerId,
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
