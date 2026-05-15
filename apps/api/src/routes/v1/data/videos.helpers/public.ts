import { getBindings } from "@/runtime/env";
import { buildPublicAsyncWebhook, toAsyncLifecycleStatus } from "@core/async-notifications";

import {
	DEFAULT_VIDEO_DOWNLOAD_TTL_SECONDS,
	DEFAULT_VIDEO_POLL_SECONDS,
	MAX_VIDEO_DOWNLOAD_TTL_SECONDS,
	normalizeText,
	type VideoJobMeta,
	type VideoJobRecord,
	type VideoStatus,
} from "./shared";
import { resolveMetaCostUsd, toFiniteNumber } from "./status";
export function toPublicVideoProviderId(value: string | null | undefined): string | null {
	const provider = normalizeText(value)?.toLowerCase() ?? null;
	if (!provider) return null;
	if (provider === "bytedance-seed") return "byteplus";
	if (provider === "xai") return "x-ai";
	return provider;
}

export function toPublicVideoStatus(
	value: unknown,
): "queued" | "processing" | "completed" | "failed" | "cancelled" | "expired" {
	const status = normalizeText(value)?.toLowerCase() ?? "";
	if (status === "completed" || status === "succeeded" || status === "success") return "completed";
	if (status === "cancelled" || status === "canceled") return "cancelled";
	if (status === "expired") return "expired";
	if (status === "failed" || status === "error") return "failed";
	if (status === "in_progress" || status === "processing" || status === "running") return "processing";
	if (status === "pending" || status === "queued") return "queued";
	return "queued";
}

export function buildVideoPollingUrl(requestUrl: string, id: string): string {
	return new URL(`/v1/videos/${encodeURIComponent(id)}`, requestUrl).toString();
}

export function buildVideoContentUrl(requestUrl: string, id: string, index: number): string {
	const url = new URL(`/v1/videos/${encodeURIComponent(id)}/content`, requestUrl);
	if (index > 0) url.searchParams.set("index", String(index));
	return url.toString();
}

export function base64UrlEncodeText(value: string): string {
	return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlDecodeText(value: string): string | null {
	try {
		const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
		const padded = normalized + "===".slice((normalized.length + 3) % 4);
		return atob(padded);
	} catch {
		return null;
	}
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
	return Array.from(new Uint8Array(signature)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function resolveVideoDownloadSigningSecret(): string | null {
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	return normalizeText(bindings.VIDEO_DOWNLOAD_SIGNING_SECRET) ?? normalizeText(bindings.KEY_PEPPER);
}

export async function issueSignedVideoDownloadUrl(args: {
	requestUrl: string;
	workspaceId: string;
	videoId: string;
	index?: number;
	ttlSeconds?: number | null;
	disposition?: "attachment" | "inline";
}): Promise<{ download_url: string; expires_at: number } | null> {
	const secret = resolveVideoDownloadSigningSecret();
	if (!secret) return null;
	const ttlSeconds = Math.max(60, Math.min(MAX_VIDEO_DOWNLOAD_TTL_SECONDS, Math.trunc(args.ttlSeconds ?? DEFAULT_VIDEO_DOWNLOAD_TTL_SECONDS)));
	const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
	const disposition = args.disposition === "inline" ? "inline" : "attachment";
	const tokenPayload = base64UrlEncodeText(JSON.stringify({
		workspace_id: args.workspaceId,
		video_id: args.videoId,
		index: typeof args.index === "number" && Number.isFinite(args.index) ? Math.max(0, Math.trunc(args.index)) : 0,
		disposition,
	}));
	const signature = await hmacSha256Hex(secret, `${tokenPayload}.${expiresAt}`);
	const index = typeof args.index === "number" && Number.isFinite(args.index) ? Math.max(0, Math.trunc(args.index)) : 0;
	const url = new URL(buildVideoContentUrl(args.requestUrl, args.videoId, index));
	url.searchParams.set("download_token", tokenPayload);
	url.searchParams.set("download_sig", signature);
	url.searchParams.set("expires_at", String(expiresAt));
	return {
		download_url: url.toString(),
		expires_at: expiresAt,
	};
}

export async function verifySignedVideoDownloadRequest(requestUrl: string): Promise<{
	workspaceId: string;
	videoId: string;
	index: number;
	disposition: "attachment" | "inline";
} | null> {
	const secret = resolveVideoDownloadSigningSecret();
	if (!secret) return null;
	const url = new URL(requestUrl);
	const token = normalizeText(url.searchParams.get("download_token"));
	const signature = normalizeText(url.searchParams.get("download_sig"));
	const expiresAtRaw = Number(url.searchParams.get("expires_at") ?? "");
	if (!token || !signature || !Number.isFinite(expiresAtRaw)) return null;
	if (Math.floor(Date.now() / 1000) > expiresAtRaw) return null;
	const expected = await hmacSha256Hex(secret, `${token}.${Math.trunc(expiresAtRaw)}`);
	if (expected !== signature) return null;
	const decoded = base64UrlDecodeText(token);
	if (!decoded) return null;
	let payload: Record<string, unknown>;
	try {
		payload = JSON.parse(decoded) as Record<string, unknown>;
	} catch {
		return null;
	}
	const workspaceId = normalizeText(payload.workspace_id);
	const videoId = normalizeText(payload.video_id);
	const indexRaw = toFiniteNumber(payload.index);
	const disposition = payload.disposition === "inline" ? "inline" : "attachment";
	if (!workspaceId || !videoId) return null;
	return {
		workspaceId,
		videoId,
		index: indexRaw != null ? Math.max(0, Math.trunc(indexRaw)) : 0,
		disposition,
	};
}

export function inferOutputBytes(base64Value: string | null | undefined): number | null {
	if (!base64Value) return null;
	try {
		const normalized = base64Value.replace(/\s+/g, "");
		const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
		return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
	} catch {
		return null;
	}
}

export function buildContentHeaders(
	headers: HeadersInit | undefined,
	options?: {
		contentDisposition?: "attachment" | "inline" | null;
		filename?: string | null;
		contentType?: string | null;
	},
): Headers {
	const out = new Headers(headers);
	if (options?.contentType && !out.has("Content-Type")) {
		out.set("Content-Type", options.contentType);
	}
	if (options?.contentDisposition) {
		const filename = normalizeText(options.filename) ?? "video.mp4";
		out.set("Content-Disposition", `${options.contentDisposition}; filename="${filename}"`);
	}
	out.set("Cache-Control", out.get("Cache-Control") ?? "private, no-store");
	return out;
}

export function toPublicVideoOutputs(requestUrl: string, id: string, payload: Record<string, unknown>, meta: VideoJobMeta | null) {
	const output = Array.isArray(payload.output) ? payload.output : [];
	return output.map((item: any, index: number) => ({
		index,
		mime_type:
			typeof item?.mime_type === "string"
				? item.mime_type
				: typeof item?.mimeType === "string"
					? item.mimeType
					: meta?.googleVideoMimeType ?? "video/mp4",
		bytes_available: typeof item?.b64_json === "string" || typeof item?.b64Json === "string",
		content_url: buildVideoContentUrl(requestUrl, id, index),
	}));
}

export function buildVideoBilling(
	record: VideoJobRecord | null,
	meta: VideoJobMeta | null,
	status: "queued" | "processing" | "completed" | "failed" | "cancelled" | "expired",
) {
	const estimated = resolveMetaCostUsd(meta);
	const settled =
		status === "completed"
			? estimated
			: status === "failed" || status === "cancelled" || status === "expired"
				? 0
				: null;
	const state =
		status === "completed"
			? "settled"
			: status === "failed" || status === "cancelled" || status === "expired"
				? "void"
				: "estimated";
	return {
		currency: "usd",
		estimated_provider_cost: estimated != null ? estimated.toFixed(2) : null,
		estimated_user_cost: estimated != null ? estimated.toFixed(2) : null,
		settled_provider_cost: settled != null ? settled.toFixed(2) : null,
		settled_user_cost: settled != null ? settled.toFixed(2) : null,
		state,
		billable: status === "completed",
		...(record?.billedAt ? { billed_at: record.billedAt } : {}),
	};
}

export function resolveVideoOutputAccess(payload: Record<string, unknown>, meta: VideoJobMeta | null): "bytes" | "signed_url" | "both" {
	const payloadOutput =
		payload.output && typeof payload.output === "object" && !Array.isArray(payload.output)
			? (payload.output as Record<string, unknown>)
			: null;
	const payloadAccess = normalizeText(payloadOutput?.access)?.toLowerCase();
	if (payloadAccess === "bytes" || payloadAccess === "signed_url" || payloadAccess === "both") {
		return payloadAccess;
	}
	const metaAccess = normalizeText(meta?.outputAccess)?.toLowerCase();
	if (metaAccess === "bytes" || metaAccess === "signed_url" || metaAccess === "both") {
		return metaAccess;
	}
	return "both";
}

export async function toPublicVideoResponse(args: {
	requestUrl: string;
	id: string;
	payload: Record<string, unknown>;
	record: VideoJobRecord | null;
	meta: VideoJobMeta | null;
}): Promise<Record<string, unknown>> {
	const provider = toPublicVideoProviderId(
		typeof args.payload.provider === "string" ? args.payload.provider : args.record?.provider ?? args.meta?.provider ?? null,
	);
	const status = toPublicVideoStatus(args.payload.status);
	const createdAt =
		(typeof args.payload.created_at === "number" ? args.payload.created_at : null) ??
		normalizeText(args.record?.createdAt) ??
		null;
	const outputs = toPublicVideoOutputs(args.requestUrl, args.id, args.payload, args.meta);
	const outputAccess = resolveVideoOutputAccess(args.payload, args.meta);
	const includeUnsignedUrls = outputAccess === "bytes" || outputAccess === "both";
	const includeSignedUrls = outputAccess === "signed_url" || outputAccess === "both";
	const outputsWithSigned = includeUnsignedUrls
		? [...outputs]
		: outputs.map((item: any) => {
			const copy = { ...(item as Record<string, unknown>) };
			delete (copy as any).content_url;
			return copy;
		});
	const firstOutput = outputs[0] ?? null;
	const outputRaw = Array.isArray(args.payload.output) ? (args.payload.output[0] as Record<string, unknown> | undefined) : undefined;
	let download: { download_url: string; expires_at: number } | null = null;
	if (status === "completed" && includeSignedUrls && args.record?.workspaceId) {
		const signedPerOutput = await Promise.all(
			outputsWithSigned.map(async (item: any) => ({
				index: typeof item?.index === "number" ? item.index : 0,
				signed: await issueSignedVideoDownloadUrl({
					requestUrl: args.requestUrl,
					workspaceId: args.record?.workspaceId ?? "",
					videoId: args.id,
					index: typeof item?.index === "number" ? item.index : 0,
				}),
			})),
		);
		for (const entry of signedPerOutput) {
			if (!entry.signed) continue;
			const outputIndex = outputsWithSigned.findIndex((item: any) => item?.index === entry.index);
			if (outputIndex >= 0) {
				(outputsWithSigned as any[])[outputIndex] = {
					...(outputsWithSigned as any[])[outputIndex],
					download_url: entry.signed.download_url,
					expires_at: entry.signed.expires_at,
				};
			}
			if (entry.index === 0) download = entry.signed;
		}
		if (!download) {
			download = (signedPerOutput.find((entry) => Boolean(entry.signed))?.signed ?? null) as
				| { download_url: string; expires_at: number }
				| null;
		}
		if (!download) {
			download = await issueSignedVideoDownloadUrl({
				requestUrl: args.requestUrl,
				workspaceId: args.record?.workspaceId ?? "",
				videoId: args.id,
				index: 0,
			});
		}
	}
	const progress = typeof args.payload.progress === "number"
		? Math.max(0, Math.min(100, Math.round(args.payload.progress)))
		: status === "completed"
			? 100
			: 0;
	const progressSource = typeof args.payload.progress === "number" ? "provider" : "none";
	const durationSeconds =
		typeof args.meta?.seconds === "number"
			? args.meta.seconds
			: typeof (args.payload as any)?.seconds === "number"
				? (args.payload as any).seconds
				: null;
	const generationId =
		normalizeText((args.payload as any)?.generation_id) ??
		normalizeText(args.record?.requestId) ??
		normalizeText(args.meta?.requestId);
	const usageSource =
		args.payload.usage && typeof args.payload.usage === "object" && !Array.isArray(args.payload.usage)
			? { ...(args.payload.usage as Record<string, unknown>) }
			: {};
	const usageCost =
		toFiniteNumber((usageSource as any)?.cost) ??
		toFiniteNumber((usageSource as any)?.cost_usd) ??
		toFiniteNumber((usageSource as any)?.costUsd) ??
		resolveMetaCostUsd(args.meta);
	const isByok = args.meta?.keySource === "byok";
	if (usageCost != null && usageSource.cost == null) {
		usageSource.cost = usageCost;
	}
	if (usageCost != null && usageSource.cost_usd == null) {
		usageSource.cost_usd = usageCost;
	}
	if (usageSource.is_byok == null) {
		usageSource.is_byok = isByok;
	}
	const errorValue =
		typeof args.payload.error === "string"
			? args.payload.error
			: typeof (args.payload.error as any)?.message === "string"
				? (args.payload.error as any).message
				: args.payload.error;
	const asset = status === "completed" && firstOutput
		? {
			id: `ast_${args.id.replace(/^G-/, "")}`,
			mime_type: firstOutput.mime_type ?? "video/mp4",
			bytes: inferOutputBytes(typeof (outputRaw as any)?.b64_json === "string" ? (outputRaw as any).b64_json : typeof (outputRaw as any)?.b64Json === "string" ? (outputRaw as any).b64Json : null),
			sha256: null,
			width: null,
			height: null,
			duration_seconds: durationSeconds,
		}
		: null;
	const response: Record<string, unknown> = {
		id: args.id,
		object: "video",
		status,
		lifecycle_status: toAsyncLifecycleStatus(status),
		output_access: outputAccess,
		progress,
		progress_source: progressSource,
		polling_url: buildVideoPollingUrl(args.requestUrl, args.id),
		poll_after_seconds: DEFAULT_VIDEO_POLL_SECONDS,
		cancel_url: null,
		generation_id: generationId ?? null,
		created_at: createdAt,
		started_at: normalizeText((args.payload as any)?.started_at) ?? null,
		completed_at:
			normalizeText((args.payload as any)?.completed_at) ??
			(status === "completed" || status === "failed" || status === "cancelled" || status === "expired"
				? normalizeText(args.meta?.finalizedAt)
				: null),
		provider,
		model:
			normalizeText(args.payload.model) ??
			normalizeText(args.record?.model) ??
			normalizeText(args.meta?.model),
		seconds: durationSeconds,
		size: normalizeText(args.meta?.resolution) ?? null,
		audio: typeof (args.payload as any)?.audio === "boolean" ? (args.payload as any).audio : null,
		asset,
		outputs: outputsWithSigned,
		...(Object.keys(usageSource).length > 0 ? { usage: usageSource } : {}),
		...(errorValue ? { error: errorValue } : {}),
		billing: buildVideoBilling(args.record, args.meta, status),
	};
	const webhook = buildPublicAsyncWebhook("video", args.meta);
	if (webhook) {
		response.webhook = webhook;
	}
	if (includeUnsignedUrls) {
		response.content_url = buildVideoContentUrl(args.requestUrl, args.id, 0);
	}
	if (includeSignedUrls) {
		response.download_url = download?.download_url ?? null;
		response.expires_at = download?.expires_at ?? null;
	}
	return response;
}


