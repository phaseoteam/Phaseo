// Purpose: Track async batch jobs with team ownership.
// Why: Batch APIs are long-running and require team-scoped lookup on retrieval.
// How: Persist/read batch metadata from shared async-operations storage.

import {
	claimAsyncOperationsForReconciliation,
	findAsyncOperationByNativeId,
	getAsyncOperation,
	isAsyncOperationBilled,
	listTeamAsyncOperations,
	markAsyncOperationBilled,
	patchAsyncOperationMeta,
	setAsyncOperationStatus,
	updateAsyncOperationReconciliation,
	upsertAsyncOperation,
} from "@core/async-operations";

export type BatchJobMeta = {
	resource?: "job";
	provider: string;
	requestId?: string | null;
	apiKeyId?: string | null;
	sessionId?: string | null;
	appId?: string | null;
	model?: string | null;
	status?: string | null;
	nativeBatchId?: string | null;
	endpoint?: string | null;
	completionWindow?: string | null;
	inputFileId?: string | null;
	inputMode?: "file" | "requests" | null;
	outputFileId?: string | null;
	errorFileId?: string | null;
	requestCounts?: {
		total?: number | null;
		completed?: number | null;
		failed?: number | null;
	} | null;
	costNanos?: number | null;
	costUsd?: number | null;
	charged?: boolean | null;
	billingReason?: string | null;
	finalizedAt?: string | null;
	pricedUsage?: Record<string, unknown> | null;
	pricingBreakdown?: Record<string, unknown> | null;
	webhook?: Record<string, unknown> | null;
	webhookDeliveries?: Record<string, string> | null;
	webhookAttempts?: Record<string, unknown>[] | null;
	webhookRetryQueue?: Record<string, unknown> | null;
	nextWebhookRetryAt?: string | null;
	lastWebhookProgress?: number | null;
	lastWebhookProgressAt?: string | null;
	lastWebhookDispatchedAt?: string | null;
	keySource?: "gateway" | "byok" | null;
	byokKeyId?: string | null;
	reservationId?: string | null;
	reservedNanos?: number | null;
	reservationStatus?: string | null;
	reservationEstimate?: {
		strategy?: string | null;
		requestCount?: number | null;
		inputTokenUpperBound?: number | null;
		outputTokenUpperBound?: number | null;
		marginBps?: number | null;
	} | null;
	submissionOutcome?: "accepted" | "rejected" | "unknown" | null;
	submissionError?: string | null;
	createdAt?: number;
	providerDispatchedAtMs?: number;
	durationMs?: number | null;
	generationMs?: number | null;
};

export type BatchJobRecord = {
	workspaceId: string;
	batchId: string;
	requestId: string | null;
	sessionId: string | null;
	appId: string | null;
	nativeId: string | null;
	provider: string | null;
	model: string | null;
	status: string | null;
	billedAt: string | null;
	meta: BatchJobMeta | null;
	nextReconcileAt: string | null;
	reconcileAttempts: number;
	updatedAt: string | null;
	createdAt: string | null;
};

export type BatchFileMeta = {
	provider: string;
	status?: string | null;
	purpose?: string | null;
	filename?: string | null;
	bytes?: number | null;
	keySource?: "gateway" | "byok" | null;
	byokKeyId?: string | null;
	createdAt?: number;
};

const BATCH_FILE_INTERNAL_PREFIX = "__file__:";
const BATCH_RECONCILE_STATUSES = [
	null,
	"submitting",
	"submission_unknown",
	"validating",
	"pending",
	"in_progress",
	"finalizing",
	"cancelling",
	"completed",
	"failed",
	"expired",
	"cancelled",
	"canceled",
];

function nextIsoFromNow(delaySeconds: number): string {
	return new Date(Date.now() + Math.max(0, Math.trunc(delaySeconds)) * 1_000).toISOString();
}

function initialBatchReconcileAt(status?: string | null): string | null {
	const normalized = String(status ?? "").toLowerCase();
	if (
		normalized === "completed" ||
		normalized === "failed" ||
		normalized === "expired" ||
		normalized === "cancelled" ||
		normalized === "canceled"
	) {
		return null;
	}
	return nextIsoFromNow(5 * 60);
}

function toNonEmptyString(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function parseBatchMeta(value: unknown): BatchJobMeta | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const source = value as Record<string, unknown>;
	if (source.resource === "file") return null;
	const provider = typeof source.provider === "string" ? source.provider.trim() : "";
	if (!provider) return null;
	const out: BatchJobMeta = { provider, resource: "job" };
	if (typeof source.requestId === "string") out.requestId = source.requestId;
	if (typeof source.request_id === "string") out.requestId = source.request_id;
	if (typeof source.apiKeyId === "string") out.apiKeyId = source.apiKeyId;
	if (typeof source.api_key_id === "string") out.apiKeyId = source.api_key_id;
	if (typeof source.sessionId === "string") out.sessionId = source.sessionId;
	if (typeof source.session_id === "string") out.sessionId = source.session_id;
	if (typeof source.appId === "string") out.appId = source.appId;
	if (typeof source.app_id === "string") out.appId = source.app_id;
	if (typeof source.model === "string") out.model = source.model;
	if (typeof source.status === "string") out.status = source.status;
	if (typeof source.nativeBatchId === "string") out.nativeBatchId = source.nativeBatchId;
	if (typeof source.endpoint === "string") out.endpoint = source.endpoint;
	if (typeof source.completionWindow === "string") out.completionWindow = source.completionWindow;
	if (typeof source.inputFileId === "string") out.inputFileId = source.inputFileId;
	if (source.inputMode === "file" || source.inputMode === "requests") out.inputMode = source.inputMode;
	if (source.inputMode === "inline") out.inputMode = "requests";
	if (source.input_mode === "file" || source.input_mode === "requests") out.inputMode = source.input_mode;
	if (source.input_mode === "inline") out.inputMode = "requests";
	if (typeof source.outputFileId === "string") out.outputFileId = source.outputFileId;
	if (typeof source.errorFileId === "string") out.errorFileId = source.errorFileId;
	const requestCountsRaw =
		source.requestCounts && typeof source.requestCounts === "object" && !Array.isArray(source.requestCounts)
			? (source.requestCounts as Record<string, unknown>)
			: source.request_counts && typeof source.request_counts === "object" && !Array.isArray(source.request_counts)
				? (source.request_counts as Record<string, unknown>)
				: null;
	if (requestCountsRaw) {
		out.requestCounts = {
			total: typeof requestCountsRaw.total === "number" ? requestCountsRaw.total : null,
			completed: typeof requestCountsRaw.completed === "number" ? requestCountsRaw.completed : null,
			failed: typeof requestCountsRaw.failed === "number" ? requestCountsRaw.failed : null,
		};
	}
	if (typeof source.costNanos === "number") out.costNanos = source.costNanos;
	if (typeof source.cost_nanos === "number") out.costNanos = source.cost_nanos;
	if (typeof source.costUsd === "number") out.costUsd = source.costUsd;
	if (typeof source.cost_usd === "number") out.costUsd = source.cost_usd;
	if (typeof source.charged === "boolean") out.charged = source.charged;
	if (typeof source.billingReason === "string") out.billingReason = source.billingReason;
	if (typeof source.billing_reason === "string") out.billingReason = source.billing_reason;
	if (typeof source.finalizedAt === "string") out.finalizedAt = source.finalizedAt;
	if (typeof source.finalized_at === "string") out.finalizedAt = source.finalized_at;
	if (source.pricedUsage && typeof source.pricedUsage === "object" && !Array.isArray(source.pricedUsage)) {
		out.pricedUsage = source.pricedUsage as Record<string, unknown>;
	}
	if (source.priced_usage && typeof source.priced_usage === "object" && !Array.isArray(source.priced_usage)) {
		out.pricedUsage = source.priced_usage as Record<string, unknown>;
	}
	if (source.pricingBreakdown && typeof source.pricingBreakdown === "object" && !Array.isArray(source.pricingBreakdown)) {
		out.pricingBreakdown = source.pricingBreakdown as Record<string, unknown>;
	}
	if (source.pricing_breakdown && typeof source.pricing_breakdown === "object" && !Array.isArray(source.pricing_breakdown)) {
		out.pricingBreakdown = source.pricing_breakdown as Record<string, unknown>;
	}
	if (source.webhook && typeof source.webhook === "object" && !Array.isArray(source.webhook)) {
		out.webhook = source.webhook as Record<string, unknown>;
	}
	if (source.webhookDeliveries && typeof source.webhookDeliveries === "object" && !Array.isArray(source.webhookDeliveries)) {
		out.webhookDeliveries = source.webhookDeliveries as Record<string, string>;
	}
	if (source.webhook_deliveries && typeof source.webhook_deliveries === "object" && !Array.isArray(source.webhook_deliveries)) {
		out.webhookDeliveries = source.webhook_deliveries as Record<string, string>;
	}
	if (Array.isArray(source.webhookAttempts)) out.webhookAttempts = source.webhookAttempts as Record<string, unknown>[];
	if (Array.isArray(source.webhook_attempts)) out.webhookAttempts = source.webhook_attempts as Record<string, unknown>[];
	if (source.webhookRetryQueue && typeof source.webhookRetryQueue === "object" && !Array.isArray(source.webhookRetryQueue)) {
		out.webhookRetryQueue = source.webhookRetryQueue as Record<string, unknown>;
	}
	if (source.webhook_retry_queue && typeof source.webhook_retry_queue === "object" && !Array.isArray(source.webhook_retry_queue)) {
		out.webhookRetryQueue = source.webhook_retry_queue as Record<string, unknown>;
	}
	if (typeof source.nextWebhookRetryAt === "string") out.nextWebhookRetryAt = source.nextWebhookRetryAt;
	if (typeof source.next_webhook_retry_at === "string") out.nextWebhookRetryAt = source.next_webhook_retry_at;
	if (typeof source.lastWebhookProgress === "number") out.lastWebhookProgress = source.lastWebhookProgress;
	if (typeof source.last_webhook_progress === "number") out.lastWebhookProgress = source.last_webhook_progress;
	if (typeof source.lastWebhookProgressAt === "string") out.lastWebhookProgressAt = source.lastWebhookProgressAt;
	if (typeof source.last_webhook_progress_at === "string") out.lastWebhookProgressAt = source.last_webhook_progress_at;
	if (typeof source.lastWebhookDispatchedAt === "string") out.lastWebhookDispatchedAt = source.lastWebhookDispatchedAt;
	if (typeof source.last_webhook_dispatched_at === "string") out.lastWebhookDispatchedAt = source.last_webhook_dispatched_at;
	if (source.keySource === "gateway" || source.keySource === "byok") out.keySource = source.keySource;
	if (typeof source.byokKeyId === "string") out.byokKeyId = source.byokKeyId;
	if (typeof source.reservationId === "string") out.reservationId = source.reservationId;
	if (typeof source.reservation_id === "string") out.reservationId = source.reservation_id;
	if (typeof source.reservedNanos === "number") out.reservedNanos = source.reservedNanos;
	if (typeof source.reserved_nanos === "number") out.reservedNanos = source.reserved_nanos;
	if (typeof source.reservationStatus === "string") out.reservationStatus = source.reservationStatus;
	if (typeof source.reservation_status === "string") out.reservationStatus = source.reservation_status;
	const reservationEstimate = source.reservationEstimate && typeof source.reservationEstimate === "object" && !Array.isArray(source.reservationEstimate)
		? source.reservationEstimate as Record<string, unknown>
		: source.reservation_estimate && typeof source.reservation_estimate === "object" && !Array.isArray(source.reservation_estimate)
			? source.reservation_estimate as Record<string, unknown>
			: null;
	if (reservationEstimate) {
		out.reservationEstimate = {
			strategy: typeof reservationEstimate.strategy === "string" ? reservationEstimate.strategy : null,
			requestCount: typeof reservationEstimate.requestCount === "number" ? reservationEstimate.requestCount : null,
			inputTokenUpperBound: typeof reservationEstimate.inputTokenUpperBound === "number" ? reservationEstimate.inputTokenUpperBound : null,
			outputTokenUpperBound: typeof reservationEstimate.outputTokenUpperBound === "number" ? reservationEstimate.outputTokenUpperBound : null,
			marginBps: typeof reservationEstimate.marginBps === "number" ? reservationEstimate.marginBps : null,
		};
	}
	if (source.submissionOutcome === "accepted" || source.submissionOutcome === "rejected" || source.submissionOutcome === "unknown") {
		out.submissionOutcome = source.submissionOutcome;
	}
	if (typeof source.submissionError === "string") out.submissionError = source.submissionError;
	if (typeof source.createdAt === "number") out.createdAt = source.createdAt;
	if (typeof source.providerDispatchedAtMs === "number") out.providerDispatchedAtMs = source.providerDispatchedAtMs;
	if (typeof source.provider_dispatched_at_ms === "number") out.providerDispatchedAtMs = source.provider_dispatched_at_ms;
	if (typeof source.durationMs === "number") out.durationMs = source.durationMs;
	if (typeof source.duration_ms === "number") out.durationMs = source.duration_ms;
	if (typeof source.generationMs === "number") out.generationMs = source.generationMs;
	if (typeof source.generation_ms === "number") out.generationMs = source.generation_ms;
	return out;
}

function parseBatchFileMeta(value: unknown): BatchFileMeta | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const source = value as Record<string, unknown>;
	if (source.resource !== "file") return null;
	const provider = typeof source.provider === "string" ? source.provider.trim() : "";
	if (!provider) return null;
	const out: BatchFileMeta = { provider };
	if (typeof source.status === "string") out.status = source.status;
	if (typeof source.purpose === "string") out.purpose = source.purpose;
	if (typeof source.filename === "string") out.filename = source.filename;
	if (typeof source.bytes === "number") out.bytes = source.bytes;
	if (source.keySource === "gateway" || source.keySource === "byok") out.keySource = source.keySource;
	if (typeof source.byokKeyId === "string") out.byokKeyId = source.byokKeyId;
	if (typeof source.createdAt === "number") out.createdAt = source.createdAt;
	return out;
}

function mergeDbBatchMeta(record: Awaited<ReturnType<typeof getAsyncOperation>>): BatchJobMeta | null {
	if (!record) return null;
	const meta = {
		...(record.meta ?? {}),
		...(record.provider ? { provider: record.provider } : {}),
		...(record.model ? { model: record.model } : {}),
		...(record.status ? { status: record.status } : {}),
		...(record.nativeId ? { nativeBatchId: record.nativeId } : {}),
	};
	return parseBatchMeta(meta);
}

function toBatchJobRecord(record: Awaited<ReturnType<typeof getAsyncOperation>>): BatchJobRecord | null {
	if (!record) return null;
	const meta = mergeDbBatchMeta(record);
	if (!meta) return null;
	return {
		workspaceId: record.workspaceId,
		batchId: record.internalId,
		requestId: record.requestId,
		sessionId: record.sessionId,
		appId: record.appId,
		nativeId: record.nativeId,
		provider: record.provider,
		model: record.model,
		status: record.status,
		billedAt: record.billedAt,
		meta,
		nextReconcileAt: record.nextReconcileAt,
		reconcileAttempts: record.reconcileAttempts,
		updatedAt: record.updatedAt,
		createdAt: record.createdAt,
	};
}

export function resolveBatchProviderNativeId(args: {
	batchId: string;
	nativeId?: string | null;
	meta?: BatchJobMeta | null;
}): string {
	return (
		toNonEmptyString(args.nativeId) ??
		toNonEmptyString(args.meta?.nativeBatchId) ??
		toNonEmptyString(args.batchId) ??
		args.batchId
	);
}

export async function saveBatchJobMeta(
	workspaceId: string,
	batchId: string,
	meta: BatchJobMeta,
): Promise<void> {
	if (!workspaceId || !batchId) return;
	const payload = { ...meta, resource: "job" as const, createdAt: meta.createdAt ?? Date.now() };
	await upsertAsyncOperation({
		workspaceId,
		kind: "batch",
		internalId: batchId,
		requestId: payload.requestId ?? null,
		sessionId: payload.sessionId ?? null,
		appId: payload.appId ?? null,
		nativeId: payload.nativeBatchId ?? null,
		provider: payload.provider,
		model: payload.model ?? null,
		status: payload.status ?? null,
		meta: payload as unknown as Record<string, unknown>,
		nextReconcileAt: initialBatchReconcileAt(payload.status),
	});
}

export async function getBatchJobMeta(workspaceId: string, batchId: string): Promise<BatchJobMeta | null> {
	if (!workspaceId || !batchId) return null;
	const record = await getAsyncOperation(workspaceId, "batch", batchId);
	return mergeDbBatchMeta(record);
}

export async function getBatchJobRecord(workspaceId: string, batchId: string): Promise<BatchJobRecord | null> {
	if (!workspaceId || !batchId) return null;
	const record = await getAsyncOperation(workspaceId, "batch", batchId);
	return toBatchJobRecord(record);
}

export async function findBatchJobRecordByNativeId(
	provider: string,
	nativeId: string,
): Promise<BatchJobRecord | null> {
	if (!provider || !nativeId) return null;
	const record = await findAsyncOperationByNativeId("batch", provider, nativeId);
	return toBatchJobRecord(record);
}

export async function saveBatchFileMeta(
	workspaceId: string,
	fileId: string,
	meta: BatchFileMeta,
): Promise<void> {
	if (!workspaceId || !fileId) return;
	const payload = { ...meta, resource: "file", createdAt: meta.createdAt ?? Date.now() };
	await upsertAsyncOperation({
		workspaceId,
		kind: "batch",
		internalId: `${BATCH_FILE_INTERNAL_PREFIX}${fileId}`,
		nativeId: fileId,
		provider: payload.provider,
		model: null,
		status: payload.status ?? null,
		meta: payload as unknown as Record<string, unknown>,
	});
}

export async function getBatchFileMeta(workspaceId: string, fileId: string): Promise<BatchFileMeta | null> {
	if (!workspaceId || !fileId) return null;
	const record = await getAsyncOperation(workspaceId, "batch", `${BATCH_FILE_INTERNAL_PREFIX}${fileId}`);
	if (!record) return null;
	const merged = {
		...(record.meta ?? {}),
		...(record.provider ? { provider: record.provider } : {}),
		...(record.status ? { status: record.status } : {}),
	};
	return parseBatchFileMeta(merged);
}

export async function isBatchJobBilled(workspaceId: string, batchId: string): Promise<boolean> {
	return isAsyncOperationBilled(workspaceId, "batch", batchId);
}

export async function markBatchJobBilled(workspaceId: string, batchId: string): Promise<boolean> {
	return markAsyncOperationBilled(workspaceId, "batch", batchId);
}

export async function listPendingBatchJobs(
	limit = 100,
	options?: {
		workerId?: string;
		leaseSeconds?: number;
		shardCount?: number;
		shardIndex?: number;
	},
): Promise<BatchJobRecord[]> {
	const records = await claimAsyncOperationsForReconciliation({
		kind: "batch",
		limit,
		statuses: BATCH_RECONCILE_STATUSES,
		workerId: options?.workerId,
		leaseSeconds: options?.leaseSeconds,
		shardCount: options?.shardCount,
		shardIndex: options?.shardIndex,
	});
	return records
		.map((record) => toBatchJobRecord(record))
		.filter((record): record is BatchJobRecord => Boolean(record))
		.filter((record) => {
			const status = String(record.status ?? "").toLowerCase();
			return (
				status === "" ||
				status === "submitting" ||
				status === "submission_unknown" ||
				status === "validating" ||
				status === "pending" ||
				status === "in_progress" ||
				status === "finalizing" ||
				status === "cancelling" ||
				status === "completed" ||
				status === "failed" ||
				status === "expired" ||
				status === "cancelled" ||
				status === "canceled"
			);
		});
}

export async function listTeamBatchJobs(args: {
	workspaceId: string;
	limit?: number;
	statuses?: Array<string | null>;
}): Promise<BatchJobRecord[]> {
	if (!args.workspaceId) return [];
	const records = await listTeamAsyncOperations({
		workspaceId: args.workspaceId,
		kind: "batch",
		limit: args.limit ? Math.max(args.limit * 3, args.limit + 50) : undefined,
		statuses: args.statuses,
	});
	return records
		.map((record) => toBatchJobRecord(record))
		.filter((record): record is BatchJobRecord => Boolean(record))
		.filter((record) => !record.batchId.startsWith(BATCH_FILE_INTERNAL_PREFIX))
		.slice(0, args.limit);
}

export async function setBatchJobStatus(
	workspaceId: string,
	batchId: string,
	status: string,
	metaPatch?: Record<string, unknown>,
): Promise<void> {
	if (!workspaceId || !batchId || !status) return;
	await setAsyncOperationStatus({
		workspaceId,
		kind: "batch",
		internalId: batchId,
		status,
		metaPatch,
		nextReconcileAt: initialBatchReconcileAt(status),
	});
}

export async function patchBatchJobMeta(
	workspaceId: string,
	batchId: string,
	metaPatch: Record<string, unknown>,
): Promise<void> {
	if (!workspaceId || !batchId) return;
	if (!metaPatch || typeof metaPatch !== "object" || Array.isArray(metaPatch)) return;
	await patchAsyncOperationMeta({
		workspaceId,
		kind: "batch",
		internalId: batchId,
		metaPatch,
	});
}

export async function updateBatchJobReconciliation(args: {
	workspaceId: string;
	batchId: string;
	nextReconcileAt?: string | null;
	lastError?: string | null;
}): Promise<void> {
	if (!args.workspaceId || !args.batchId) return;
	await updateAsyncOperationReconciliation({
		workspaceId: args.workspaceId,
		kind: "batch",
		internalId: args.batchId,
		nextReconcileAt: args.nextReconcileAt,
		lastError: args.lastError,
	});
}
