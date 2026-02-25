// Purpose: Track async music generation jobs for ownership + status polling.
// Why: /music/generate returns task IDs that must be retrieved by owning teams.
// How: Persist metadata in the async-operations DB table under kind=music.

import { getAsyncOperation, upsertAsyncOperation } from "@core/async-operations";

export type MusicJobMeta = {
	provider: string;
	model?: string | null;
	duration?: number | null;
	format?: string | null;
	status?: "queued" | "in_progress" | "completed" | "failed" | string | null;
	nativeResponseId?: string | null;
	output?: Array<{
		index?: number;
		id?: string | null;
		audio_url?: string | null;
		stream_audio_url?: string | null;
		image_url?: string | null;
		title?: string | null;
		tags?: string | null;
		duration?: number | null;
	}> | null;
	createdAt?: number;
};

function parseMusicJobMeta(value: unknown): MusicJobMeta | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const source = value as Record<string, unknown>;
	const provider = typeof source.provider === "string" ? source.provider.trim() : "";
	if (!provider) return null;
	const out: MusicJobMeta = { provider };
	if (typeof source.model === "string") out.model = source.model;
	if (typeof source.duration === "number") out.duration = source.duration;
	if (typeof source.format === "string") out.format = source.format;
	if (typeof source.status === "string") out.status = source.status;
	if (typeof source.nativeResponseId === "string") out.nativeResponseId = source.nativeResponseId;
	if (Array.isArray(source.output)) out.output = source.output as MusicJobMeta["output"];
	if (typeof source.createdAt === "number") out.createdAt = source.createdAt;
	return out;
}

function mergeDbMusicMeta(record: Awaited<ReturnType<typeof getAsyncOperation>>): MusicJobMeta | null {
	if (!record) return null;
	const meta = {
		...(record.meta ?? {}),
		...(record.provider ? { provider: record.provider } : {}),
		...(record.model ? { model: record.model } : {}),
		...(record.status ? { status: record.status } : {}),
		...(record.nativeId ? { nativeResponseId: record.nativeId } : {}),
	};
	return parseMusicJobMeta(meta);
}

export async function saveMusicJobMeta(
	teamId: string,
	musicId: string,
	meta: MusicJobMeta,
	_ttlSeconds?: number,
): Promise<void> {
	if (!teamId || !musicId) return;
	const payload = { ...meta, createdAt: meta.createdAt ?? Date.now() };
	await upsertAsyncOperation({
		teamId,
		kind: "music",
		internalId: musicId,
		nativeId: payload.nativeResponseId ?? musicId,
		provider: payload.provider,
		model: payload.model ?? null,
		status: payload.status ?? null,
		meta: payload as unknown as Record<string, unknown>,
	});
}

export async function getMusicJobMeta(teamId: string, musicId: string): Promise<MusicJobMeta | null> {
	if (!teamId || !musicId) return null;
	const dbRecord = await getAsyncOperation(teamId, "music", musicId);
	return mergeDbMusicMeta(dbRecord);
}

