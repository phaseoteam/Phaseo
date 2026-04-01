// Purpose: Track async video jobs for ownership + completion-time billing.
// Why: /videos create is async; follow-up status/content calls must be team-scoped.
// How: Persist metadata and billed markers in the async-operations DB table.

import {
	findAsyncOperationByNativeId,
	getAsyncOperation,
	isAsyncOperationBilled as isAsyncOperationBilledInDb,
	listAsyncOperations,
	listTeamAsyncOperations,
	markAsyncOperationBilled as markAsyncOperationBilledInDb,
	patchAsyncOperationMeta,
	setAsyncOperationStatus,
	upsertAsyncOperation,
} from "@core/async-operations";

export type VideoStoredAssetMeta = {
	index: number;
	storageProvider: "r2";
	storageKey: string;
	mimeType: string;
	bytes: number;
	sha256: string | null;
	sourceUrl?: string | null;
	width?: number | null;
	height?: number | null;
	durationSeconds?: number | null;
	storedAt: string;
	expiresAt: string;
};

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
	costUsd?: number | null;
	costNanos?: number | null;
	charged?: boolean | null;
	billingReason?: string | null;
	finalizedAt?: string | null;
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
	storedOutputs?: VideoStoredAssetMeta[] | null;
	webhookDeliveries?: Record<string, string> | null;
	lastWebhookProgress?: number | null;
	lastWebhookProgressAt?: string | null;
	lastWebhookDispatchedAt?: string | null;
	createdAt?: number;
};

export type VideoJobRecord = {
	teamId: string;
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
	updatedAt: string | null;
	createdAt: string | null;
};

function parseStoredOutputs(value: unknown): VideoStoredAssetMeta[] | null {
	if (!Array.isArray(value)) return null;
	const out: VideoStoredAssetMeta[] = [];
	for (const item of value) {
		if (!item || typeof item !== "object" || Array.isArray(item)) continue;
		const source = item as Record<string, unknown>;
		const index =
			typeof source.index === "number" && Number.isFinite(source.index)
				? Math.max(0, Math.trunc(source.index))
				: null;
		const storageProvider =
			source.storageProvider === "r2" || source.storage_provider === "r2"
				? "r2"
				: null;
		const storageKey =
			typeof source.storageKey === "string"
				? source.storageKey
				: typeof source.storage_key === "string"
					? source.storage_key
					: null;
		const mimeType =
			typeof source.mimeType === "string"
				? source.mimeType
				: typeof source.mime_type === "string"
					? source.mime_type
					: null;
		const bytes =
			typeof source.bytes === "number" && Number.isFinite(source.bytes)
				? Math.max(0, Math.trunc(source.bytes))
				: null;
		const storedAt =
			typeof source.storedAt === "string"
				? source.storedAt
				: typeof source.stored_at === "string"
					? source.stored_at
					: null;
		const expiresAt =
			typeof source.expiresAt === "string"
				? source.expiresAt
				: typeof source.expires_at === "string"
					? source.expires_at
					: null;
		if (index == null || !storageProvider || !storageKey || !mimeType || bytes == null || !storedAt || !expiresAt) {
			continue;
		}
		out.push({
			index,
			storageProvider,
			storageKey,
			mimeType,
			bytes,
			sha256:
				typeof source.sha256 === "string"
					? source.sha256
					: typeof source.sha_256 === "string"
						? source.sha_256
						: null,
			sourceUrl:
				typeof source.sourceUrl === "string"
					? source.sourceUrl
					: typeof source.source_url === "string"
						? source.source_url
						: null,
			width:
				typeof source.width === "number" && Number.isFinite(source.width)
					? Math.max(0, Math.trunc(source.width))
					: null,
			height:
				typeof source.height === "number" && Number.isFinite(source.height)
					? Math.max(0, Math.trunc(source.height))
					: null,
			durationSeconds:
				typeof source.durationSeconds === "number" && Number.isFinite(source.durationSeconds)
					? source.durationSeconds
					: typeof source.duration_seconds === "number" && Number.isFinite(source.duration_seconds)
						? source.duration_seconds
						: null,
			storedAt,
			expiresAt,
		});
	}
	return out.length > 0 ? out : null;
}

function parseVideoJobMeta(value: unknown): VideoJobMeta | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const source = value as Record<string, unknown>;
	const provider = typeof source.provider === "string" ? source.provider.trim() : "";
	if (!provider) return null;
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
	if (typeof source.costUsd === "number") out.costUsd = source.costUsd;
	if (typeof source.cost_usd === "number") out.costUsd = source.cost_usd;
	if (typeof source.costNanos === "number") out.costNanos = source.costNanos;
	if (typeof source.cost_nanos === "number") out.costNanos = source.cost_nanos;
	if (typeof source.charged === "boolean") out.charged = source.charged;
	if (typeof source.billingReason === "string") out.billingReason = source.billingReason;
	if (typeof source.billing_reason === "string") out.billingReason = source.billing_reason;
	if (typeof source.finalizedAt === "string") out.finalizedAt = source.finalizedAt;
	if (typeof source.finalized_at === "string") out.finalizedAt = source.finalized_at;
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
	if (typeof source.reservedNanos === "number") out.reservedNanos = source.reservedNanos;
	if (typeof source.reservationStatus === "string") out.reservationStatus = source.reservationStatus;
	if (source.keySource === "gateway" || source.keySource === "byok") out.keySource = source.keySource;
	if (typeof source.byokKeyId === "string") out.byokKeyId = source.byokKeyId;
	out.storedOutputs = parseStoredOutputs(source.storedOutputs ?? source.stored_outputs);
	if (source.webhookDeliveries && typeof source.webhookDeliveries === "object" && !Array.isArray(source.webhookDeliveries)) {
		out.webhookDeliveries = source.webhookDeliveries as Record<string, string>;
	}
	if (source.webhook_deliveries && typeof source.webhook_deliveries === "object" && !Array.isArray(source.webhook_deliveries)) {
		out.webhookDeliveries = source.webhook_deliveries as Record<string, string>;
	}
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
		teamId: record.teamId,
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
		updatedAt: record.updatedAt,
		createdAt: record.createdAt,
	};
}

export async function saveVideoJobMeta(
	teamId: string,
	videoId: string,
	meta: VideoJobMeta,
	nativeId?: string | null,
	status: "queued" | "pending" | "in_progress" | "completed" | "failed" | "cancelled" | "expired" = "queued",
	_ttlSeconds?: number,
): Promise<void> {
	if (!teamId || !videoId) return;
	const payload = { ...meta, createdAt: meta.createdAt ?? Date.now() };
	await upsertAsyncOperation({
		teamId,
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
	});
	if (payload.webhook && (status === "queued" || status === "pending" || status === "in_progress")) {
		void import("@core/video-user-webhooks")
			.then((module) =>
				module.dispatchVideoWebhookEventInBackground({
					teamId,
					videoId,
					eventType: "video.created",
				}),
			)
			.catch(() => null);
	}
}

export async function getVideoJobMeta(teamId: string, videoId: string): Promise<VideoJobMeta | null> {
	if (!teamId || !videoId) return null;
	const dbRecord = await getAsyncOperation(teamId, "video", videoId);
	return mergeDbVideoMeta(dbRecord);
}

export async function getVideoJobRecord(teamId: string, videoId: string): Promise<VideoJobRecord | null> {
	if (!teamId || !videoId) return null;
	const dbRecord = await getAsyncOperation(teamId, "video", videoId);
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
		teamId: dbRecord.teamId,
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
		updatedAt: dbRecord.updatedAt,
		createdAt: dbRecord.createdAt,
	};
}

export async function listPendingVideoJobs(limit = 100): Promise<VideoJobRecord[]> {
	const records = await listAsyncOperations({
		kind: "video",
		limit,
		unbilledOnly: true,
	});
	return records
		.map((record) => ({
			teamId: record.teamId,
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
				status === "failed"
			);
		});
}

export async function listTeamVideoJobs(args: {
	teamId: string;
	limit?: number;
	statuses?: string[];
}): Promise<VideoJobRecord[]> {
	const records = await listTeamAsyncOperations({
		teamId: args.teamId,
		kind: "video",
		limit: args.limit,
		statuses: args.statuses,
	});
	return records.map((record) => ({
		teamId: record.teamId,
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
		updatedAt: record.updatedAt,
		createdAt: record.createdAt,
	}));
}

export async function setVideoJobStatus(
	teamId: string,
	videoId: string,
	status: "queued" | "in_progress" | "completed" | "failed" | "cancelled" | "expired",
	metaPatch?: Record<string, unknown>,
): Promise<void> {
	await setAsyncOperationStatus({
		teamId,
		kind: "video",
		internalId: videoId,
		status,
		metaPatch,
	});
}

export async function isVideoJobBilled(teamId: string, videoId: string): Promise<boolean> {
	if (!teamId || !videoId) return false;
	return isAsyncOperationBilledInDb(teamId, "video", videoId);
}

export async function markVideoJobBilled(
	teamId: string,
	videoId: string,
	_ttlSeconds?: number,
): Promise<void> {
	if (!teamId || !videoId) return;
	await markAsyncOperationBilledInDb(teamId, "video", videoId);
}

export async function patchVideoJobMeta(
	teamId: string,
	videoId: string,
	metaPatch: Record<string, unknown>,
): Promise<void> {
	if (!teamId || !videoId) return;
	if (!metaPatch || typeof metaPatch !== "object" || Array.isArray(metaPatch)) return;
	await patchAsyncOperationMeta({
		teamId,
		kind: "video",
		internalId: videoId,
		metaPatch,
	});
}
