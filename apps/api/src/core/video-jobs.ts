// Purpose: Track async video jobs for ownership + completion-time billing.
// Why: /videos create is async; follow-up status/content calls must be team-scoped.
// How: Persist metadata and billed markers in the async-operations DB table.

import {
	claimAsyncOperationsForReconciliation,
	findAsyncOperationByNativeId,
	getAsyncOperation,
	isAsyncOperationBilled as isAsyncOperationBilledInDb,
	listTeamAsyncOperations,
	markAsyncOperationBilled as markAsyncOperationBilledInDb,
	patchAsyncOperationMeta,
	setAsyncOperationStatus,
	updateAsyncOperationReconciliation,
	upsertAsyncOperation,
} from "@core/async-operations";

export type VideoJobMeta = {
	provider: string;
	providerTaskId?: string | null;
	requestId?: string | null;
	sessionId?: string | null;
	appId?: string | null;
	model?: string | null;
	seconds?: number | null;
	resolution?: string | null;
	quality?: string | null;
	audio?: boolean | null;
	inputImageCount?: number | null;
	inputVideoCount?: number | null;
	inputVideoSeconds?: number | null;
	frameRate?: number | null;
	outputAccess?: "bytes" | "signed_url" | "both" | null;
	downloadUrl?: string | null;
	expiresAt?: string | null;
	webhook?: Record<string, unknown> | null;
	tombstoned?: boolean | null;
	tombstonedAt?: string | null;
	googleOperationName?: string | null;
	googleVideoUri?: string | null;
	googleVideoMimeType?: string | null;
	durationMs?: number | null;
	latencyMs?: number | null;
	generationMs?: number | null;
	costUsd?: number | null;
	costNanos?: number | null;
	charged?: boolean | null;
	billingReason?: string | null;
	finalizedAt?: string | null;
	progress?: number | null;
	progressSource?: "provider" | "estimated" | "none" | null;
	lastPolledAt?: string | null;
	polledStatus?: string | null;
	lastReconciledAt?: string | null;
	pricedUsage?: Record<string, unknown> | null;
	pricingBreakdown?: Record<string, unknown> | null;
	reservationId?: string | null;
	reservedNanos?: number | null;
	reservationStatus?: string | null;
	keySource?: "gateway" | "byok" | null;
	byokKeyId?: string | null;
	webhookDeliveries?: Record<string, string> | null;
	webhookAttempts?: Record<string, unknown>[] | null;
	webhookRetryQueue?: Record<string, unknown> | null;
	nextWebhookRetryAt?: string | null;
	lastWebhookProgress?: number | null;
	lastWebhookProgressAt?: string | null;
	lastWebhookDispatchedAt?: string | null;
	createdAt?: number;
};

export type VideoJobRecord = {
	workspaceId: string;
	videoId: string;
	requestId: string | null;
	sessionId: string | null;
	appId: string | null;
	nativeId: string | null;
	provider: string | null;
	model: string | null;
	status: string | null;
	billedAt: string | null;
	meta: VideoJobMeta | null;
	nextReconcileAt: string | null;
	reconcileAttempts: number;
	updatedAt: string | null;
	createdAt: string | null;
};

const VIDEO_RECONCILE_STATUSES = [
	null,
	"queued",
	"pending",
	"in_progress",
	"processing",
	"running",
	"completed",
	"failed",
];

function nextIsoFromNow(delaySeconds: number): string {
	return new Date(Date.now() + Math.max(0, Math.trunc(delaySeconds)) * 1_000).toISOString();
}

function initialVideoReconcileAt(status: string): string | null {
	const normalized = status.toLowerCase();
	if (normalized === "completed" || normalized === "failed" || normalized === "cancelled" || normalized === "expired") {
		return null;
	}
	return nextIsoFromNow(45);
}

function parseVideoJobMeta(value: unknown): VideoJobMeta | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const source = value as Record<string, unknown>;
	const provider = typeof source.provider === "string" ? source.provider.trim() : "";
	if (!provider) return null;
	const toNonNegativeInteger = (input: unknown): number | null => {
		if (typeof input !== "number" || !Number.isFinite(input)) return null;
		const normalized = Math.trunc(input);
		return normalized >= 0 ? normalized : null;
	};
	const out: VideoJobMeta = { provider };
	if (typeof source.providerTaskId === "string") out.providerTaskId = source.providerTaskId;
	if (typeof source.provider_task_id === "string") out.providerTaskId = source.provider_task_id;
	if (typeof source.requestId === "string") out.requestId = source.requestId;
	if (typeof source.request_id === "string") out.requestId = source.request_id;
	if (typeof source.sessionId === "string") out.sessionId = source.sessionId;
	if (typeof source.session_id === "string") out.sessionId = source.session_id;
	if (typeof source.appId === "string") out.appId = source.appId;
	if (typeof source.app_id === "string") out.appId = source.app_id;
	if (typeof source.model === "string") out.model = source.model;
	if (typeof source.seconds === "number") out.seconds = source.seconds;
	if (typeof source.resolution === "string") out.resolution = source.resolution;
	if (typeof source.quality === "string") out.quality = source.quality;
	if (typeof source.audio === "boolean") out.audio = source.audio;
	if (typeof source.generateAudio === "boolean") out.audio = source.generateAudio;
	if (typeof source.generate_audio === "boolean") out.audio = source.generate_audio;
	const camelInputImageCount = toNonNegativeInteger(source.inputImageCount);
	if (camelInputImageCount != null) out.inputImageCount = camelInputImageCount;
	const snakeInputImageCount = toNonNegativeInteger(source.input_image_count);
	if (snakeInputImageCount != null) out.inputImageCount = snakeInputImageCount;
	if (typeof source.inputVideoCount === "number") out.inputVideoCount = source.inputVideoCount;
	if (typeof source.input_video_count === "number") out.inputVideoCount = source.input_video_count;
	if (typeof source.inputVideoSeconds === "number") out.inputVideoSeconds = source.inputVideoSeconds;
	if (typeof source.input_video_seconds === "number") out.inputVideoSeconds = source.input_video_seconds;
	if (typeof source.frameRate === "number") out.frameRate = source.frameRate;
	if (typeof source.frame_rate === "number") out.frameRate = source.frame_rate;
	if (source.outputAccess === "bytes" || source.outputAccess === "signed_url" || source.outputAccess === "both") {
		out.outputAccess = source.outputAccess;
	}
	if (source.output_access === "bytes" || source.output_access === "signed_url" || source.output_access === "both") {
		out.outputAccess = source.output_access;
	}
	if (typeof source.downloadUrl === "string") out.downloadUrl = source.downloadUrl;
	if (typeof source.download_url === "string") out.downloadUrl = source.download_url;
	if (typeof source.expiresAt === "string") out.expiresAt = source.expiresAt;
	if (typeof source.expires_at === "string") out.expiresAt = source.expires_at;
	if (source.webhook && typeof source.webhook === "object" && !Array.isArray(source.webhook)) {
		out.webhook = source.webhook as Record<string, unknown>;
	}
	if (typeof source.tombstoned === "boolean") out.tombstoned = source.tombstoned;
	if (typeof source.tombstonedAt === "string") out.tombstonedAt = source.tombstonedAt;
	if (typeof source.tombstoned_at === "string") out.tombstonedAt = source.tombstoned_at;
	if (typeof source.googleOperationName === "string") out.googleOperationName = source.googleOperationName;
	if (typeof source.google_operation_name === "string") out.googleOperationName = source.google_operation_name;
	if (typeof source.googleVideoUri === "string") out.googleVideoUri = source.googleVideoUri;
	if (typeof source.google_video_uri === "string") out.googleVideoUri = source.google_video_uri;
	if (typeof source.googleVideoMimeType === "string") out.googleVideoMimeType = source.googleVideoMimeType;
	if (typeof source.google_video_mime_type === "string") out.googleVideoMimeType = source.google_video_mime_type;
	if (typeof source.durationMs === "number") out.durationMs = source.durationMs;
	if (typeof source.duration_ms === "number") out.durationMs = source.duration_ms;
	if (typeof source.latencyMs === "number") out.latencyMs = source.latencyMs;
	if (typeof source.latency_ms === "number") out.latencyMs = source.latency_ms;
	if (typeof source.generationMs === "number") out.generationMs = source.generationMs;
	if (typeof source.generation_ms === "number") out.generationMs = source.generation_ms;
	if (typeof source.costUsd === "number") out.costUsd = source.costUsd;
	if (typeof source.cost_usd === "number") out.costUsd = source.cost_usd;
	if (typeof source.costNanos === "number") out.costNanos = source.costNanos;
	if (typeof source.cost_nanos === "number") out.costNanos = source.cost_nanos;
	if (typeof source.charged === "boolean") out.charged = source.charged;
	if (typeof source.billingReason === "string") out.billingReason = source.billingReason;
	if (typeof source.billing_reason === "string") out.billingReason = source.billing_reason;
	if (typeof source.finalizedAt === "string") out.finalizedAt = source.finalizedAt;
	if (typeof source.finalized_at === "string") out.finalizedAt = source.finalized_at;
	if (typeof source.progress === "number") out.progress = source.progress;
	if (source.progressSource === "provider" || source.progressSource === "estimated" || source.progressSource === "none") {
		out.progressSource = source.progressSource;
	}
	if (source.progress_source === "provider" || source.progress_source === "estimated" || source.progress_source === "none") {
		out.progressSource = source.progress_source;
	}
	if (typeof source.lastPolledAt === "string") out.lastPolledAt = source.lastPolledAt;
	if (typeof source.last_polled_at === "string") out.lastPolledAt = source.last_polled_at;
	if (typeof source.polledStatus === "string") out.polledStatus = source.polledStatus;
	if (typeof source.polled_status === "string") out.polledStatus = source.polled_status;
	if (typeof source.lastReconciledAt === "string") out.lastReconciledAt = source.lastReconciledAt;
	if (typeof source.last_reconciled_at === "string") out.lastReconciledAt = source.last_reconciled_at;
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
	if (typeof source.reservationId === "string") out.reservationId = source.reservationId;
	if (typeof source.reservation_id === "string") out.reservationId = source.reservation_id;
	if (typeof source.reservedNanos === "number") out.reservedNanos = source.reservedNanos;
	if (typeof source.reserved_nanos === "number") out.reservedNanos = source.reserved_nanos;
	if (typeof source.reservationStatus === "string") out.reservationStatus = source.reservationStatus;
	if (typeof source.reservation_status === "string") out.reservationStatus = source.reservation_status;
	if (source.keySource === "gateway" || source.keySource === "byok") out.keySource = source.keySource;
	if (typeof source.byokKeyId === "string") out.byokKeyId = source.byokKeyId;
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
	if (typeof source.createdAt === "number") out.createdAt = source.createdAt;
	return out;
}

function mergeDbVideoMeta(record: Awaited<ReturnType<typeof getAsyncOperation>>): VideoJobMeta | null {
	if (!record) return null;
	const meta = {
		...(record.meta ?? {}),
		...(record.provider ? { provider: record.provider } : {}),
		...(record.model ? { model: record.model } : {}),
	};
	return parseVideoJobMeta(meta);
}

function toVideoJobRecord(record: Awaited<ReturnType<typeof getAsyncOperation>>): VideoJobRecord | null {
	if (!record) return null;
	return {
		workspaceId: record.workspaceId,
		videoId: record.internalId,
		requestId: record.requestId,
		sessionId: record.sessionId,
		appId: record.appId,
		nativeId: record.nativeId,
		provider: record.provider,
		model: record.model,
		status: record.status,
		billedAt: record.billedAt,
		meta: mergeDbVideoMeta(record),
		nextReconcileAt: record.nextReconcileAt,
		reconcileAttempts: record.reconcileAttempts,
		updatedAt: record.updatedAt,
		createdAt: record.createdAt,
	};
}

export async function saveVideoJobMeta(
	workspaceId: string,
	videoId: string,
	meta: VideoJobMeta,
	nativeId?: string | null,
	status: "queued" | "pending" | "in_progress" | "completed" | "failed" | "cancelled" | "expired" = "queued",
	_ttlSeconds?: number,
): Promise<void> {
	if (!workspaceId || !videoId) return;
	const payload = { ...meta, createdAt: meta.createdAt ?? Date.now() };
	await upsertAsyncOperation({
		workspaceId,
		kind: "video",
		internalId: videoId,
		requestId: payload.requestId ?? videoId,
		sessionId: payload.sessionId ?? null,
		appId: payload.appId ?? null,
		nativeId: nativeId ?? payload.providerTaskId ?? null,
		provider: payload.provider,
		model: payload.model ?? null,
		status,
		meta: payload as unknown as Record<string, unknown>,
		nextReconcileAt: initialVideoReconcileAt(status),
	});
	if (payload.webhook && (status === "queued" || status === "pending" || status === "in_progress")) {
		void import("@core/video-user-webhooks")
			.then((module) =>
				module.dispatchVideoWebhookEventInBackground({
					workspaceId,
					videoId,
					eventType: "video.created",
				}),
			)
			.catch(() => null);
	}
}

export async function getVideoJobMeta(workspaceId: string, videoId: string): Promise<VideoJobMeta | null> {
	if (!workspaceId || !videoId) return null;
	const dbRecord = await getAsyncOperation(workspaceId, "video", videoId);
	return mergeDbVideoMeta(dbRecord);
}

export async function getVideoJobRecord(workspaceId: string, videoId: string): Promise<VideoJobRecord | null> {
	if (!workspaceId || !videoId) return null;
	const dbRecord = await getAsyncOperation(workspaceId, "video", videoId);
	return toVideoJobRecord(dbRecord);
}

export async function findVideoJobRecordByNativeId(
	provider: string,
	nativeId: string,
): Promise<VideoJobRecord | null> {
	if (!provider || !nativeId) return null;
	const dbRecord = await findAsyncOperationByNativeId("video", provider, nativeId);
	if (!dbRecord) return null;
	return {
		workspaceId: dbRecord.workspaceId,
		videoId: dbRecord.internalId,
		requestId: dbRecord.requestId,
		sessionId: dbRecord.sessionId,
		appId: dbRecord.appId,
		nativeId: dbRecord.nativeId,
		provider: dbRecord.provider,
		model: dbRecord.model,
		status: dbRecord.status,
		billedAt: dbRecord.billedAt,
		meta: mergeDbVideoMeta(dbRecord),
		nextReconcileAt: dbRecord.nextReconcileAt,
		reconcileAttempts: dbRecord.reconcileAttempts,
		updatedAt: dbRecord.updatedAt,
		createdAt: dbRecord.createdAt,
	};
}

export async function listPendingVideoJobs(
	limit = 100,
	options?: {
		workerId?: string;
		leaseSeconds?: number;
		shardCount?: number;
		shardIndex?: number;
	},
): Promise<VideoJobRecord[]> {
	const records = await claimAsyncOperationsForReconciliation({
		kind: "video",
		limit,
		statuses: VIDEO_RECONCILE_STATUSES,
		workerId: options?.workerId,
		leaseSeconds: options?.leaseSeconds,
		shardCount: options?.shardCount,
		shardIndex: options?.shardIndex,
	});
	return records
		.map((record) => ({
			workspaceId: record.workspaceId,
			videoId: record.internalId,
			requestId: record.requestId,
			sessionId: record.sessionId,
			appId: record.appId,
			nativeId: record.nativeId,
			provider: record.provider,
			model: record.model,
			status: record.status,
			billedAt: record.billedAt,
			meta: mergeDbVideoMeta(record),
			nextReconcileAt: record.nextReconcileAt,
			reconcileAttempts: record.reconcileAttempts,
			updatedAt: record.updatedAt,
			createdAt: record.createdAt,
		}))
		.filter((record) => {
			const status = String(record.status ?? "").toLowerCase();
			return (
				status === "" ||
				status === "queued" ||
				status === "in_progress" ||
				status === "processing" ||
				status === "running" ||
				status === "completed" ||
				status === "failed" ||
				status === "cancelled" ||
				status === "canceled" ||
				status === "expired"
			);
		});
}

export async function listTeamVideoJobs(args: {
	workspaceId: string;
	limit?: number;
	statuses?: string[];
}): Promise<VideoJobRecord[]> {
	const records = await listTeamAsyncOperations({
		workspaceId: args.workspaceId,
		kind: "video",
		limit: args.limit,
		statuses: args.statuses,
	});
	return records.map((record) => ({
		workspaceId: record.workspaceId,
		videoId: record.internalId,
		requestId: record.requestId,
		sessionId: record.sessionId,
		appId: record.appId,
		nativeId: record.nativeId,
		provider: record.provider,
		model: record.model,
		status: record.status,
		billedAt: record.billedAt,
		meta: mergeDbVideoMeta(record),
		nextReconcileAt: record.nextReconcileAt,
		reconcileAttempts: record.reconcileAttempts,
		updatedAt: record.updatedAt,
		createdAt: record.createdAt,
	}));
}

export async function setVideoJobStatus(
	workspaceId: string,
	videoId: string,
	status: "queued" | "in_progress" | "completed" | "failed" | "cancelled" | "expired",
	metaPatch?: Record<string, unknown>,
): Promise<void> {
	await setAsyncOperationStatus({
		workspaceId,
		kind: "video",
		internalId: videoId,
		status,
		metaPatch,
		nextReconcileAt: initialVideoReconcileAt(status),
	});
}

export async function isVideoJobBilled(workspaceId: string, videoId: string): Promise<boolean> {
	if (!workspaceId || !videoId) return false;
	return isAsyncOperationBilledInDb(workspaceId, "video", videoId);
}

export async function markVideoJobBilled(
	workspaceId: string,
	videoId: string,
	_ttlSeconds?: number,
): Promise<void> {
	if (!workspaceId || !videoId) return;
	await markAsyncOperationBilledInDb(workspaceId, "video", videoId);
}

export async function patchVideoJobMeta(
	workspaceId: string,
	videoId: string,
	metaPatch: Record<string, unknown>,
): Promise<void> {
	if (!workspaceId || !videoId) return;
	if (!metaPatch || typeof metaPatch !== "object" || Array.isArray(metaPatch)) return;
	await patchAsyncOperationMeta({
		workspaceId,
		kind: "video",
		internalId: videoId,
		metaPatch,
	});
}

export async function updateVideoJobReconciliation(args: {
	workspaceId: string;
	videoId: string;
	nextReconcileAt?: string | null;
	lastError?: string | null;
}): Promise<void> {
	if (!args.workspaceId || !args.videoId) return;
	await updateAsyncOperationReconciliation({
		workspaceId: args.workspaceId,
		kind: "video",
		internalId: args.videoId,
		nextReconcileAt: args.nextReconcileAt,
		lastError: args.lastError,
	});
}
