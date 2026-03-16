// Purpose: Track async video jobs for ownership + completion-time billing.
// Why: /videos create is async; follow-up status/content calls must be team-scoped.
// How: Persist metadata and billed markers in the async-operations DB table.

import {
	findAsyncOperationByNativeId,
	getAsyncOperation,
	isAsyncOperationBilled as isAsyncOperationBilledInDb,
	listAsyncOperations,
	markAsyncOperationBilled as markAsyncOperationBilledInDb,
	setAsyncOperationStatus,
	upsertAsyncOperation,
} from "@core/async-operations";

export type VideoJobMeta = {
	provider: string;
	model?: string | null;
	seconds?: number | null;
	resolution?: string | null;
	quality?: string | null;
	reservationId?: string | null;
	reservedNanos?: number | null;
	reservationStatus?: string | null;
	keySource?: "gateway" | "byok" | null;
	byokKeyId?: string | null;
	createdAt?: number;
};

export type VideoJobRecord = {
	teamId: string;
	videoId: string;
	nativeId: string | null;
	provider: string | null;
	model: string | null;
	status: string | null;
	billedAt: string | null;
	meta: VideoJobMeta | null;
	updatedAt: string | null;
	createdAt: string | null;
};

function parseVideoJobMeta(value: unknown): VideoJobMeta | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const source = value as Record<string, unknown>;
	const provider = typeof source.provider === "string" ? source.provider.trim() : "";
	if (!provider) return null;
	const out: VideoJobMeta = { provider };
	if (typeof source.model === "string") out.model = source.model;
	if (typeof source.seconds === "number") out.seconds = source.seconds;
	if (typeof source.resolution === "string") out.resolution = source.resolution;
	if (typeof source.quality === "string") out.quality = source.quality;
	if (typeof source.reservationId === "string") out.reservationId = source.reservationId;
	if (typeof source.reservedNanos === "number") out.reservedNanos = source.reservedNanos;
	if (typeof source.reservationStatus === "string") out.reservationStatus = source.reservationStatus;
	if (source.keySource === "gateway" || source.keySource === "byok") out.keySource = source.keySource;
	if (typeof source.byokKeyId === "string") out.byokKeyId = source.byokKeyId;
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
	status: "queued" | "in_progress" | "completed" | "failed" = "queued",
	_ttlSeconds?: number,
): Promise<void> {
	if (!teamId || !videoId) return;
	const payload = { ...meta, createdAt: meta.createdAt ?? Date.now() };
	await upsertAsyncOperation({
		teamId,
		kind: "video",
		internalId: videoId,
		nativeId: videoId,
		provider: payload.provider,
		model: payload.model ?? null,
		status,
		meta: payload as unknown as Record<string, unknown>,
	});
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

export async function setVideoJobStatus(
	teamId: string,
	videoId: string,
	status: "queued" | "in_progress" | "completed" | "failed",
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
