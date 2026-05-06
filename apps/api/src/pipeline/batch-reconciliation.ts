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

function resolveOpenAiBaseUrl(bindings: Record<string, string | undefined>): string {
	const base = String(bindings.OPENAI_BASE_URL || OPENAI_BASE_URL).replace(/\/+$/, "");
	return /\/v1$/i.test(base) ? base : `${base}/v1`;
}

function batchMetaFromPayload(payload: any, base: BatchJobMeta): BatchJobMeta {
	const id = normalizeText(payload?.id);
	return {
		...base,
		status: normalizeText(payload?.status) ?? base.status ?? null,
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
	const response = await fetch(
		`${resolveOpenAiBaseUrl(bindings)}/batches/${encodeURIComponent(job.batchId)}`,
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
			const payload = await fetchOpenAiBatchStatus(job);
			if (!payload) return counts;
			counts.jobsPolled += 1;
			const previousStatus = String(job.status ?? job.meta?.status ?? "").toLowerCase();
			const nextStatus = String(payload?.status ?? job.status ?? "").toLowerCase();
			await saveBatchJobMeta(
				job.workspaceId,
				job.batchId,
				batchMetaFromPayload(payload, {
					...(job.meta ?? { provider: OPENAI_PROVIDER_ID }),
					provider: OPENAI_PROVIDER_ID,
				}),
			);
			await persistBatchFileOwnership(job.workspaceId, payload);
			counts.jobsUpdated += 1;
			if (nextStatus !== previousStatus) {
				const phase = mapTerminalPhase(nextStatus);
				if (phase) {
					dispatchAsyncWebhookEventInBackground({
						workspaceId: job.workspaceId,
						kind: "batch",
						internalId: job.batchId,
						phase,
					});
					await finalizeBatchJob({
						workspaceId: job.workspaceId,
						batchId: job.batchId,
						status: nextStatus,
					});
					if (phase === "completed") counts.jobsCompleted += 1;
					if (phase === "failed") counts.jobsFailed += 1;
					if (phase === "cancelled") counts.jobsCancelled += 1;
				}
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
