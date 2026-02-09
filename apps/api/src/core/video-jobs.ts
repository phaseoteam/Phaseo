// Purpose: Track async video jobs for completion-time billing.
// Why: /videos create is async; billing should happen when job completes.
// How: Store lightweight metadata and a billed marker in KV.

import { getCache } from "@/runtime/env";

const VIDEO_JOB_META_PREFIX = "gateway:video:meta";
const VIDEO_JOB_BILLED_PREFIX = "gateway:video:billed";
const VIDEO_JOB_META_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days
const VIDEO_JOB_BILLED_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export type VideoJobMeta = {
	provider: string;
	model?: string | null;
	seconds?: number | null;
	size?: string | null;
	quality?: string | null;
	createdAt?: number;
};

function keyPart(value: string): string {
	return encodeURIComponent(String(value ?? "").trim());
}

function metaKey(teamId: string, videoId: string): string {
	return `${VIDEO_JOB_META_PREFIX}:${keyPart(teamId)}:${keyPart(videoId)}`;
}

function billedKey(teamId: string, videoId: string): string {
	return `${VIDEO_JOB_BILLED_PREFIX}:${keyPart(teamId)}:${keyPart(videoId)}`;
}

export async function saveVideoJobMeta(
	teamId: string,
	videoId: string,
	meta: VideoJobMeta,
	ttlSeconds: number = VIDEO_JOB_META_TTL_SECONDS,
): Promise<void> {
	if (!teamId || !videoId) return;
	const cache = getCache();
	await cache.put(metaKey(teamId, videoId), JSON.stringify(meta), {
		expirationTtl: ttlSeconds,
	});
}

export async function getVideoJobMeta(teamId: string, videoId: string): Promise<VideoJobMeta | null> {
	if (!teamId || !videoId) return null;
	const raw = await getCache().get(metaKey(teamId, videoId), "text");
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") return null;
		return parsed as VideoJobMeta;
	} catch {
		return null;
	}
}

export async function isVideoJobBilled(teamId: string, videoId: string): Promise<boolean> {
	if (!teamId || !videoId) return false;
	const value = await getCache().get(billedKey(teamId, videoId), "text");
	return value === "1";
}

export async function markVideoJobBilled(
	teamId: string,
	videoId: string,
	ttlSeconds: number = VIDEO_JOB_BILLED_TTL_SECONDS,
): Promise<void> {
	if (!teamId || !videoId) return;
	await getCache().put(billedKey(teamId, videoId), "1", {
		expirationTtl: ttlSeconds,
	});
}
