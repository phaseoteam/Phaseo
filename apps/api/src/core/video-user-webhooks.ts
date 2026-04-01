import { dispatchBackground } from "@/runtime/env";
import { getVideoJobRecord, patchVideoJobMeta, type VideoJobMeta, type VideoJobRecord } from "@core/video-jobs";
import {
	buildVideoContentUrl,
	buildVideoPollingUrl,
	issueSignedVideoDownloadUrl,
	resolveGatewayPublicBaseUrl,
	toPublicVideoProviderId,
	toPublicVideoStatus,
} from "@core/video-public";

type VideoWebhookEventType =
	| "video.created"
	| "video.progress"
	| "video.completed"
	| "video.failed"
	| "video.cancelled";

function normalizeText(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function toFiniteNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value.trim());
		if (Number.isFinite(parsed)) return parsed;
	}
	return null;
}

function extractWebhookConfig(meta: VideoJobMeta | null): { url: string; secret?: string | null; events: string[] } | null {
	if (!meta?.webhook || typeof meta.webhook !== "object" || Array.isArray(meta.webhook)) return null;
	const url = normalizeText((meta.webhook as Record<string, unknown>).url);
	if (!url) return null;
	const secret = normalizeText((meta.webhook as Record<string, unknown>).secret);
	const rawEvents = Array.isArray((meta.webhook as Record<string, unknown>).events)
		? ((meta.webhook as Record<string, unknown>).events as unknown[])
		: [];
	const events = rawEvents
		.map((value) => normalizeText(value))
		.filter((value): value is string => Boolean(value))
		.map((value) => value.startsWith("video.") ? value : `video.${value}`);
	return {
		url,
		secret,
		events: events.length > 0 ? events : ["video.completed", "video.failed", "video.cancelled"],
	};
}

function buildBilling(meta: VideoJobMeta | null, status: ReturnType<typeof toPublicVideoStatus>) {
	const estimated = toFiniteNumber(meta?.costUsd);
	const settled = status === "completed" ? estimated : status === "failed" || status === "cancelled" ? 0 : null;
	return {
		currency: "usd",
		estimated_provider_cost: estimated != null ? estimated.toFixed(2) : null,
		estimated_user_cost: estimated != null ? estimated.toFixed(2) : null,
		settled_provider_cost: settled != null ? settled.toFixed(2) : null,
		settled_user_cost: settled != null ? settled.toFixed(2) : null,
		state: status === "completed" ? "settled" : status === "failed" || status === "cancelled" ? "void" : "estimated",
		billable: status === "completed",
	};
}

function buildAsset(meta: VideoJobMeta | null, videoId: string) {
	void meta;
	void videoId;
	return null;
}

async function signWebhook(secret: string, timestamp: string, body: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`));
	return Array.from(new Uint8Array(signature)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

function buildPayload(args: {
	baseUrl: string;
	record: VideoJobRecord;
	meta: VideoJobMeta | null;
	eventType: VideoWebhookEventType;
	progress?: number | null;
	download?: { download_url: string; expires_at: number } | null;
}) {
	const status = toPublicVideoStatus(args.record.status ?? args.meta?.polledStatus ?? null);
	return {
		type: args.eventType,
		created_at: Math.floor(Date.now() / 1000),
		data: {
			id: args.record.videoId,
			object: "video",
			status,
			progress: typeof args.progress === "number" ? Math.max(0, Math.min(100, Math.round(args.progress))) : status === "completed" ? 100 : 0,
			provider: toPublicVideoProviderId(args.record.provider ?? args.meta?.provider),
			model: normalizeText(args.record.model) ?? normalizeText(args.meta?.model),
			polling_url: buildVideoPollingUrl(args.baseUrl, args.record.videoId),
			content_url: buildVideoContentUrl(args.baseUrl, args.record.videoId, 0),
			download_url: args.download?.download_url ?? null,
			expires_at: args.download?.expires_at ?? null,
			asset: buildAsset(args.meta, args.record.videoId),
			billing: buildBilling(args.meta, status),
		},
	};
}

function normalizeProgressBucket(progress: number | null | undefined): number | null {
	if (typeof progress !== "number" || !Number.isFinite(progress)) return null;
	if (progress <= 0 || progress >= 100) return null;
	const rounded = Math.round(progress);
	const bucket = Math.round(rounded / 10) * 10;
	return Math.max(5, Math.min(95, bucket));
}

export async function dispatchVideoWebhookEvent(args: {
	teamId: string;
	videoId: string;
	eventType: VideoWebhookEventType;
	progress?: number | null;
	force?: boolean;
	baseUrl?: string | null;
}): Promise<boolean> {
	const record = await getVideoJobRecord(args.teamId, args.videoId);
	if (!record) return false;
	const meta = record.meta;
	const webhook = extractWebhookConfig(meta);
	if (!webhook) return false;
	if (!webhook.events.includes(args.eventType)) return false;
	const deliveries = meta?.webhookDeliveries ?? {};
	const progressBucket = args.eventType === "video.progress" ? normalizeProgressBucket(args.progress ?? null) : null;
	if (args.eventType === "video.progress" && progressBucket == null) return false;
	const deliveryKey = args.eventType === "video.progress" ? `${args.eventType}:${progressBucket}` : args.eventType;
	if (!args.force && deliveries[deliveryKey]) return false;
	const baseUrl = resolveGatewayPublicBaseUrl(args.baseUrl ?? null);
	const status = toPublicVideoStatus(record.status ?? meta?.polledStatus ?? null);
	const download = status === "completed"
		? await issueSignedVideoDownloadUrl({
			baseUrl,
			teamId: args.teamId,
			videoId: args.videoId,
			index: 0,
		})
		: null;
	const payload = buildPayload({
		baseUrl,
		record,
		meta,
		eventType: args.eventType,
		progress: args.progress,
		download,
	});
	const body = JSON.stringify(payload);
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		"User-Agent": "AI-Stats-Video-Webhook/1.0",
	};
	if (webhook.secret) {
		const timestamp = String(Math.floor(Date.now() / 1000));
		headers["x-ai-stats-timestamp"] = timestamp;
		headers["x-ai-stats-signature"] = await signWebhook(webhook.secret, timestamp, body);
	}
	const res = await fetch(webhook.url, {
		method: "POST",
		headers,
		body,
	});
	if (!res.ok) {
		const preview = await res.text().catch(() => "");
		console.error("video_user_webhook_failed", {
			teamId: args.teamId,
			videoId: args.videoId,
			eventType: args.eventType,
			status: res.status,
			bodyPreview: preview.slice(0, 500),
		});
		return false;
	}
	await patchVideoJobMeta(args.teamId, args.videoId, {
		webhookDeliveries: {
			...deliveries,
			[deliveryKey]: new Date().toISOString(),
		},
		...(progressBucket != null ? { lastWebhookProgress: progressBucket, lastWebhookProgressAt: new Date().toISOString() } : {}),
		lastWebhookDispatchedAt: new Date().toISOString(),
	});
	return true;
}

export function dispatchVideoWebhookEventInBackground(args: {
	teamId: string;
	videoId: string;
	eventType: VideoWebhookEventType;
	progress?: number | null;
	force?: boolean;
	baseUrl?: string | null;
}) {
	dispatchBackground(
		dispatchVideoWebhookEvent(args).catch((error) => {
			console.error("video_user_webhook_background_failed", {
				error,
				teamId: args.teamId,
				videoId: args.videoId,
				eventType: args.eventType,
			});
		}),
	);
}

export function dispatchVideoProgressWebhookInBackground(args: {
	teamId: string;
	videoId: string;
	progress: number;
	force?: boolean;
	baseUrl?: string | null;
}) {
	dispatchVideoWebhookEventInBackground({
		...args,
		eventType: "video.progress",
	});
}
