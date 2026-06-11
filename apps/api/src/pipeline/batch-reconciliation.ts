import { getBindings } from "@/runtime/env";
import { dispatchAsyncWebhookEventInBackground } from "@core/async-notifications";
import {
	listPendingBatchJobs,
	saveBatchFileMeta,
	saveBatchJobMeta,
	type BatchJobMeta,
	type BatchJobRecord,
} from "@core/batch-jobs";
import { finalizeBatchJob } from "@core/batch-finalization";
import { resolveProviderKey } from "@providers/keys";

export type BatchReconciliationSummary = {
	startedAt: string;
	finishedAt: string;
	jobsScanned: number;
	jobsPolled: number;
	jobsUpdated: number;
	jobsCompleted: number;
	jobsFailed: number;
	jobsExpired: number;
	jobsCancelled: number;
	jobsErrored: number;
};

const OPENAI_PROVIDER_ID = "openai";
const OPENAI_BASE_URL = "https://api.openai.com";

function normalizeText(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function normalizeBatchStatus(value: unknown): string | null {
	const text = normalizeText(value)?.toLowerCase() ?? null;
	if (text === "canceled") return "cancelled";
	return text;
}

function isTerminalBatchStatus(status: string | null): boolean {
	return status === "completed" || status === "failed" || status === "expired" || status === "cancelled";
}

function resolveOpenAiBaseUrl(bindings: Record<string, string | undefined>): string {
	const base = String(bindings.OPENAI_BASE_URL || OPENAI_BASE_URL).replace(/\/+$/, "");
	return /\/v1$/i.test(base) ? base : `${base}/v1`;
}

function resolveMergedBatchStatus(payload: any, base: BatchJobMeta): string | null {
	const incomingText = normalizeText(payload?.status);
	const incomingStatus = normalizeBatchStatus(incomingText);
	const currentStatus = normalizeBatchStatus(base.status);
	if (isTerminalBatchStatus(currentStatus) && incomingStatus && incomingStatus !== currentStatus) {
		console.warn("batch_reconcile_stale_terminal_status_ignored", {
			nativeBatchId: normalizeText(payload?.id) ?? base.nativeBatchId ?? null,
			currentStatus,
			incomingStatus,
		});
		return base.status ?? currentStatus;
	}
	return incomingText ?? base.status ?? null;
}

function batchMetaFromPayload(payload: any, base: BatchJobMeta): BatchJobMeta {
	const id = normalizeText(payload?.id);
	const status = resolveMergedBatchStatus(payload, base);
	return {
		...base,
		status,
		model: normalizeText(payload?.model) ?? base.model ?? null,
		nativeBatchId: id ?? base.nativeBatchId ?? null,
		endpoint: normalizeText(payload?.endpoint) ?? base.endpoint ?? null,
		completionWindow: normalizeText(payload?.completion_window) ?? base.completionWindow ?? null,
		inputFileId: normalizeText(payload?.input_file_id) ?? base.inputFileId ?? null,
		outputFileId: normalizeText(payload?.output_file_id) ?? base.outputFileId ?? null,
		errorFileId: normalizeText(payload?.error_file_id) ?? base.errorFileId ?? null,
		requestCounts:
			payload?.request_counts && typeof payload.request_counts === "object" && !Array.isArray(payload.request_counts)
				? {
					total: typeof payload.request_counts.total === "number" ? payload.request_counts.total : null,
					completed: typeof payload.request_counts.completed === "number" ? payload.request_counts.completed : null,
					failed: typeof payload.request_counts.failed === "number" ? payload.request_counts.failed : null,
				}
				: base.requestCounts ?? null,
		lastPolledAt: new Date().toISOString(),
		polledStatus: normalizeBatchStatus(status) ?? status,
	};
}

async function persistBatchFileOwnership(workspaceId: string, payload: any): Promise<void> {
	const outputFileId = normalizeText(payload?.output_file_id);
	if (outputFileId) {
		await saveBatchFileMeta(workspaceId, outputFileId, {
			provider: OPENAI_PROVIDER_ID,
			status: "available",
		});
	}
	const errorFileId = normalizeText(payload?.error_file_id);
	if (errorFileId) {
		await saveBatchFileMeta(workspaceId, errorFileId, {
			provider: OPENAI_PROVIDER_ID,
			status: "available",
		});
	}
}

async function fetchOpenAiBatchStatus(job: BatchJobRecord): Promise<any | null> {
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const keyInfo = resolveProviderKey(
		{ providerId: OPENAI_PROVIDER_ID, byokMeta: [] },
		() => bindings.OPENAI_API_KEY,
	);
	const upstreamBatchId = normalizeText(job.meta?.nativeBatchId) ?? normalizeText(job.nativeId) ?? job.batchId;
	const response = await fetch(
		`${resolveOpenAiBaseUrl(bindings)}/batches/${encodeURIComponent(upstreamBatchId)}`,
		{
			method: "GET",
			headers: {
				Authorization: `Bearer ${keyInfo.key}`,
			},
		},
	);
	if (!response.ok) {
		const preview = await response.text().catch(() => "");
		throw new Error(`openai_batch_fetch_failed_${response.status}:${preview.slice(0, 200)}`);
	}
	return response.json().catch(() => null);
}

function mapTerminalPhase(status: string): "completed" | "failed" | "expired" | "cancelled" | null {
	switch (status) {
		case "completed":
			return "completed";
		case "failed":
			return "failed";
		case "expired":
			return "expired";
		case "cancelled":
		case "canceled":
			return "cancelled";
		default:
			return null;
	}
}

function resolveBatchProgressPercent(meta: BatchJobMeta | null | undefined): number | null {
	const counts = meta?.requestCounts;
	if (!counts) return null;
	const total = typeof counts.total === "number" && Number.isFinite(counts.total) ? counts.total : null;
	if (!total || total <= 0) return null;
	const completed = typeof counts.completed === "number" && Number.isFinite(counts.completed) ? counts.completed : 0;
	const failed = typeof counts.failed === "number" && Number.isFinite(counts.failed) ? counts.failed : 0;
	const finished = Math.max(0, Math.min(total, completed + failed));
	const progress = Math.round((finished / total) * 100);
	if (progress <= 0 || progress >= 100) return null;
	return progress;
}

export async function runBatchReconciliationJob(args?: {
	limit?: number;
	concurrency?: number;
}): Promise<BatchReconciliationSummary> {
	const startedAt = new Date().toISOString();
	const jobs = await listPendingBatchJobs(args?.limit ?? 100);
	const maxConcurrency = Math.max(1, Math.min(12, Math.trunc(args?.concurrency ?? 4)));

	const aggregates = {
		jobsPolled: 0,
		jobsUpdated: 0,
		jobsCompleted: 0,
		jobsFailed: 0,
		jobsExpired: 0,
		jobsCancelled: 0,
		jobsErrored: 0,
	};

	const processJob = async (job: BatchJobRecord) => {
		const counts = {
			jobsPolled: 0,
			jobsUpdated: 0,
			jobsCompleted: 0,
			jobsFailed: 0,
			jobsExpired: 0,
			jobsCancelled: 0,
			jobsErrored: 0,
		};
		try {
			const previousStatus = String(job.status ?? job.meta?.status ?? "").toLowerCase();
			const previousPhase = mapTerminalPhase(previousStatus);
			if (previousPhase) {
				const finalized = await finalizeBatchJob({
					workspaceId: job.workspaceId,
					batchId: job.batchId,
					status: previousStatus,
				});
				const finalizedStatus = String(finalized.status ?? previousStatus).toLowerCase();
				const finalizedPhase = mapTerminalPhase(finalizedStatus);
				if (finalizedPhase && finalizedStatus !== previousStatus) {
					dispatchAsyncWebhookEventInBackground({
						workspaceId: job.workspaceId,
						kind: "batch",
						internalId: job.batchId,
						phase: finalizedPhase,
					});
				}
				counts.jobsUpdated += 1;
				if (finalizedPhase === "completed") counts.jobsCompleted += 1;
				if (finalizedPhase === "failed") counts.jobsFailed += 1;
				if (finalizedPhase === "expired") counts.jobsExpired += 1;
				if (finalizedPhase === "cancelled") counts.jobsCancelled += 1;
				return counts;
			}

			const payload = await fetchOpenAiBatchStatus(job);
			if (!payload) return counts;
			counts.jobsPolled += 1;
			const nextStatus = String(payload?.status ?? job.status ?? "").toLowerCase();
			const refreshedMeta = batchMetaFromPayload(payload, {
				...(job.meta ?? { provider: OPENAI_PROVIDER_ID }),
				provider: OPENAI_PROVIDER_ID,
			});
			await saveBatchJobMeta(
				job.workspaceId,
				job.batchId,
				refreshedMeta,
			);
			await persistBatchFileOwnership(job.workspaceId, payload);
			counts.jobsUpdated += 1;
			const phase = mapTerminalPhase(nextStatus);
			if (!phase) {
				const progress = resolveBatchProgressPercent(refreshedMeta);
				if (progress != null) {
					dispatchAsyncWebhookEventInBackground({
						workspaceId: job.workspaceId,
						kind: "batch",
						internalId: job.batchId,
						phase: "progress",
						progress,
					});
				}
			}
			if (phase) {
				const finalized = await finalizeBatchJob({
					workspaceId: job.workspaceId,
					batchId: job.batchId,
					status: nextStatus,
				});
				const finalizedStatus = String(finalized.status ?? nextStatus).toLowerCase();
				const finalizedPhase = mapTerminalPhase(finalizedStatus);
				if (finalizedPhase && finalizedStatus !== previousStatus) {
					dispatchAsyncWebhookEventInBackground({
						workspaceId: job.workspaceId,
						kind: "batch",
						internalId: job.batchId,
						phase: finalizedPhase,
					});
				}
				if (finalizedPhase === "completed") counts.jobsCompleted += 1;
				if (finalizedPhase === "failed") counts.jobsFailed += 1;
				if (finalizedPhase === "expired") counts.jobsExpired += 1;
				if (finalizedPhase === "cancelled") counts.jobsCancelled += 1;
			}
		} catch (error) {
			counts.jobsErrored += 1;
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
				aggregates.jobsExpired += result.jobsExpired;
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
		jobsExpired: aggregates.jobsExpired,
		jobsCancelled: aggregates.jobsCancelled,
		jobsErrored: aggregates.jobsErrored,
	};
}
