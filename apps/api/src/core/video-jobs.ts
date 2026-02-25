// Purpose: Track async video jobs for ownership + completion-time billing.
// Why: /videos create is async; follow-up status/content calls must be team-scoped.
// How: Persist metadata and billed markers in the async-operations DB table.

import {
	getAsyncOperation,
	isAsyncOperationBilled as isAsyncOperationBilledInDb,
	markAsyncOperationBilled as markAsyncOperationBilledInDb,
	upsertAsyncOperation,
} from "@core/async-operations";

export type VideoJobMeta = {
	provider: string;
	model?: string | null;
	seconds?: number | null;
	size?: string | null;
	quality?: string | null;
	keySource?: "gateway" | "byok" | null;
	byokKeyId?: string | null;
	createdAt?: number;
};

function parseVideoJobMeta(value: unknown): VideoJobMeta | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const source = value as Record<string, unknown>;
	const provider = typeof source.provider === "string" ? source.provider.trim() : "";
	if (!provider) return null;
	const out: VideoJobMeta = { provider };
	if (typeof source.model === "string") out.model = source.model;
	if (typeof source.seconds === "number") out.seconds = source.seconds;
	if (typeof source.size === "string") out.size = source.size;
	if (typeof source.quality === "string") out.quality = source.quality;
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

export async function saveVideoJobMeta(
	teamId: string,
	videoId: string,
	meta: VideoJobMeta,
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
		meta: payload as unknown as Record<string, unknown>,
	});
}

export async function getVideoJobMeta(teamId: string, videoId: string): Promise<VideoJobMeta | null> {
	if (!teamId || !videoId) return null;
	const dbRecord = await getAsyncOperation(teamId, "video", videoId);
	return mergeDbVideoMeta(dbRecord);
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
