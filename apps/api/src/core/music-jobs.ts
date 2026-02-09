// Purpose: Track async music generation jobs for provider polling.
// Why: /music/generate create requests return task IDs that need follow-up status fetches.
// How: Store per-team per-job metadata in KV.

import { getCache } from "@/runtime/env";

const MUSIC_JOB_META_PREFIX = "gateway:music:meta";
const MUSIC_JOB_META_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days

export type MusicJobMeta = {
	provider: string;
	model?: string | null;
	duration?: number | null;
	format?: string | null;
	createdAt?: number;
};

function keyPart(value: string): string {
	return encodeURIComponent(String(value ?? "").trim());
}

function metaKey(teamId: string, musicId: string): string {
	return `${MUSIC_JOB_META_PREFIX}:${keyPart(teamId)}:${keyPart(musicId)}`;
}

export async function saveMusicJobMeta(
	teamId: string,
	musicId: string,
	meta: MusicJobMeta,
	ttlSeconds: number = MUSIC_JOB_META_TTL_SECONDS,
): Promise<void> {
	if (!teamId || !musicId) return;
	const cache = getCache();
	await cache.put(metaKey(teamId, musicId), JSON.stringify(meta), {
		expirationTtl: ttlSeconds,
	});
}

export async function getMusicJobMeta(teamId: string, musicId: string): Promise<MusicJobMeta | null> {
	if (!teamId || !musicId) return null;
	const raw = await getCache().get(metaKey(teamId, musicId), "text");
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") return null;
		return parsed as MusicJobMeta;
	} catch {
		return null;
	}
}
