import { getBindings } from "@/runtime/env";
import { buildAsyncWebSocketUrl, buildPublicAsyncWebhook, toAsyncLifecycleStatus } from "@core/async-notifications";

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

export function buildVideoCancelUrl(requestUrl: string, id: string): string {
	return new URL(`/v1/videos/${encodeURIComponent(id)}/cancel`, requestUrl).toString();
}

function normalizeIsoDate(value: unknown): string | null {
	const text = normalizeText(value);
	if (!text) return null;
	const parsed = Date.parse(text);
	return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function isVideoCancelSupportedProvider(value: string | null | undefined): boolean {
	const provider = normalizeText(value)?.toLowerCase();
	return (
		provider === "openai" ||
		provider === "alibaba" ||
		provider === "alibaba-cloud" ||
		provider === "qwen" ||
		provider === "runway"
	);
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
	return normalizeText(bindings.VIDEO_DOWNLOAD_SIGNING_SECRET);
}

async function verifyHmacSha256Hex(secret: string, message: string, signatureHex: string): Promise<boolean> {
	if (!/^[a-f0-9]{64}$/i.test(signatureHex)) return false;
	const signature = Uint8Array.from(signatureHex.match(/.{2}/g) ?? [], (value) => Number.parseInt(value, 16));
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["verify"],
	);
	return crypto.subtle.verify("HMAC", key, signature, new TextEncoder().encode(message));
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
	if (!await verifyHmacSha256Hex(secret, `${token}.${Math.trunc(expiresAtRaw)}`, signature)) return null;
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
	// Signed links serve the provider's bytes from Phaseo's origin, so only transfer headers
	// pass through and only a video (or still image) type is served as such. Anything else,
	// such as text/html or image/svg+xml, is an opaque download.
	const upstream = new Headers(headers);
	const out = new Headers();
	for (const name of ["Content-Range", "Accept-Ranges", "ETag", "Last-Modified"]) {
		const value = upstream.get(name);
		if (value) out.set(name, value);
	}
	const length = upstream.get("Content-Length");
	if (length && /^\d+$/.test(length) && !upstream.get("Content-Encoding")) out.set("Content-Length", length);
	const contentType = safeVideoContentType(upstream.get("Content-Type") ?? options?.contentType ?? null);
	out.set("Content-Type", contentType ?? "application/octet-stream");
	const disposition = contentType ? options?.contentDisposition : "attachment";
	if (disposition) {
		const filename = normalizeText(options?.filename)?.replace(/["\\\r\n]/g, "") || "video.mp4";
		out.set("Content-Disposition", `${disposition}; filename="${filename}"`);
	}
	out.set("Cache-Control", "private, no-store");
	out.set("X-Content-Type-Options", "nosniff");
	out.set("Content-Security-Policy", "sandbox; default-src 'none'");
	return out;
}

const SAFE_IMAGE_CONTENT_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/** The media type when it is a video or a PNG, JPEG or WebP image; null otherwise. */
export function safeVideoContentType(value: string | null | undefined): string | null {
	const type = (value ?? "").split(";")[0]!.trim().toLowerCase();
	if (/^video\/[a-z0-9][a-z0-9.+-]{0,63}$/.test(type)) return type;
	return SAFE_IMAGE_CONTENT_TYPES.has(type) ? type : null;
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
	const settledNanos = toFiniteNumber(meta?.costNanos);
	const settledUsd =
		toFiniteNumber(meta?.costUsd) ??
		(settledNanos != null ? Math.max(0, settledNanos) / 1e9 : null);
	const pricedUsage =
		meta?.pricedUsage && typeof meta.pricedUsage === "object" && !Array.isArray(meta.pricedUsage)
			? (meta.pricedUsage as Record<string, unknown>)
			: null;
	const pricedUsagePricing =
		pricedUsage?.pricing && typeof pricedUsage.pricing === "object" && !Array.isArray(pricedUsage.pricing)
			? (pricedUsage.pricing as Record<string, unknown>)
			: null;
	const estimatedNanos =
		toFiniteNumber(pricedUsagePricing?.total_nanos) ??
		toFiniteNumber((pricedUsage as any)?.total_nanos) ??
		toFiniteNumber(meta?.reservedNanos);
	const estimated =
		toFiniteNumber(pricedUsagePricing?.cost_usd) ??
		toFiniteNumber((pricedUsage as any)?.cost_usd) ??
		(estimatedNanos != null ? Math.max(0, estimatedNanos) / 1e9 : null);
	const settled =
		status === "completed"
			? settledUsd
			: status === "failed" || status === "cancelled" || status === "expired"
				? 0
				: null;
	const state =
		status === "failed" || status === "cancelled" || status === "expired"
				? "void"
				: settledUsd != null
					? "settled"
					: status === "completed"
						? "pending"
					: estimated != null
						? "estimated"
						: "pending";
	const charged = typeof meta?.charged === "boolean" ? meta.charged : null;
	return {
		currency: "usd",
		estimated_provider_cost: estimated != null ? estimated.toFixed(2) : null,
		estimated_user_cost: estimated != null ? estimated.toFixed(2) : null,
		settled_provider_cost: settled != null ? settled.toFixed(2) : null,
		settled_user_cost: settled != null ? settled.toFixed(2) : null,
		state,
		billable:
			charged === true ||
			(settledNanos != null && settledNanos > 0) ||
			(state === "estimated" && (
				(estimatedNanos != null && estimatedNanos > 0) ||
				(typeof meta?.reservedNanos === "number" && meta.reservedNanos > 0)
			)),
		total_nanos: settledNanos ?? null,
		estimated_nanos: estimatedNanos ?? null,
		reserved_nanos: typeof meta?.reservedNanos === "number" ? meta.reservedNanos : null,
		reservation_id: normalizeText(meta?.reservationId),
		reservation_status: normalizeText(meta?.reservationStatus),
		charge_reason: normalizeText(meta?.billingReason),
		charged,
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
	const rawProvider =
		typeof args.payload.provider === "string"
			? args.payload.provider
			: args.record?.provider ?? args.meta?.provider ?? null;
	const provider = toPublicVideoProviderId(rawProvider);
	const normalizedStatus = toPublicVideoStatus(args.payload.status);
	const isOpenAI = provider === "openai";
	const status = isOpenAI && normalizedStatus === "processing" ? "in_progress" : normalizedStatus;
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
	if (normalizedStatus === "completed" && includeSignedUrls && args.record?.workspaceId) {
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
	const metaProgress = toFiniteNumber(args.meta?.progress ?? (args.meta as any)?.progress);
	const progress = typeof args.payload.progress === "number"
		? Math.max(0, Math.min(100, Math.round(args.payload.progress)))
		: metaProgress != null
			? Math.max(0, Math.min(100, Math.round(metaProgress)))
			: normalizedStatus === "completed"
				? 100
				: 0;
	const metaProgressSource = normalizeText(args.meta?.progressSource ?? (args.meta as any)?.progress_source);
	const progressSource = typeof args.payload.progress === "number"
		? "provider"
		: metaProgress != null && (metaProgressSource === "provider" || metaProgressSource === "estimated")
			? metaProgressSource
			: "none";
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
	const nativeVideoId =
		normalizeText((args.payload as any)?.native_video_id) ??
		normalizeText((args.payload as any)?.native_id) ??
		normalizeText(args.record?.nativeId) ??
		normalizeText(args.meta?.providerTaskId);
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
	const errorValue = isOpenAI && args.payload.error && typeof args.payload.error === "object"
		? args.payload.error
		: typeof args.payload.error === "string"
			? args.payload.error
			: typeof (args.payload.error as any)?.message === "string"
				? (args.payload.error as any).message
				: args.payload.error;
	const asset = normalizedStatus === "completed" && firstOutput
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
		lifecycle_status: toAsyncLifecycleStatus(normalizedStatus),
		output_access: outputAccess,
		progress,
		progress_source: progressSource,
		polling_url: buildVideoPollingUrl(args.requestUrl, args.id),
		websocket_url: buildAsyncWebSocketUrl(args.requestUrl, "video", args.id),
		poll_after_seconds: DEFAULT_VIDEO_POLL_SECONDS,
		cancel_url: null,
		generation_id: generationId ?? null,
		native_video_id: nativeVideoId ?? null,
		created_at: createdAt,
		expires_at: typeof (args.payload as any)?.expires_at === "number" ? (args.payload as any).expires_at : null,
		started_at: normalizeText((args.payload as any)?.started_at) ?? null,
		completed_at:
			(typeof (args.payload as any)?.completed_at === "number" ? (args.payload as any).completed_at : normalizeText((args.payload as any)?.completed_at)) ??
			(normalizedStatus === "completed" || normalizedStatus === "failed" || normalizedStatus === "cancelled" || normalizedStatus === "expired"
				? normalizeText(args.meta?.finalizedAt)
				: null),
		provider,
		model:
			normalizeText(args.payload.model) ??
			normalizeText(args.record?.model) ??
			normalizeText(args.meta?.model),
		seconds: isOpenAI && durationSeconds != null ? String(durationSeconds) : durationSeconds,
		size: normalizeText(args.meta?.resolution) ?? null,
		...(isOpenAI ? {
			prompt: normalizeText((args.payload as any)?.prompt),
			remixed_from_video_id: normalizeText((args.payload as any)?.remixed_from_video_id),
			...(normalizeText((args.payload as any)?.quality) ? { quality: normalizeText((args.payload as any)?.quality) } : {}),
		} : {}),
		audio: typeof (args.payload as any)?.audio === "boolean" ? (args.payload as any).audio : null,
		asset,
		outputs: outputsWithSigned,
		...(Object.keys(usageSource).length > 0 ? { usage: usageSource } : {}),
		...(errorValue ? { error: errorValue } : {}),
		billing: buildVideoBilling(args.record, args.meta, normalizedStatus),
	};
	const webhook = buildPublicAsyncWebhook("video", args.meta);
	if (webhook) {
		response.webhook = webhook;
	}
	const nextWebhookRetryAt = normalizeIsoDate(args.meta?.nextWebhookRetryAt ?? (args.meta as any)?.next_webhook_retry_at);
	if (nextWebhookRetryAt) response.next_webhook_retry_at = nextWebhookRetryAt;
	const lastWebhookProgress = toFiniteNumber(args.meta?.lastWebhookProgress ?? (args.meta as any)?.last_webhook_progress);
	if (lastWebhookProgress != null) response.last_webhook_progress = lastWebhookProgress;
	const lastWebhookProgressAt = normalizeIsoDate(args.meta?.lastWebhookProgressAt ?? (args.meta as any)?.last_webhook_progress_at);
	if (lastWebhookProgressAt) response.last_webhook_progress_at = lastWebhookProgressAt;
	const lastWebhookDispatchedAt = normalizeIsoDate(
		args.meta?.lastWebhookDispatchedAt ?? (args.meta as any)?.last_webhook_dispatched_at,
	);
	if (lastWebhookDispatchedAt) response.last_webhook_dispatched_at = lastWebhookDispatchedAt;
	if (includeUnsignedUrls) {
		response.content_url = buildVideoContentUrl(args.requestUrl, args.id, 0);
	}
	if (includeSignedUrls) {
		response.download_url = download?.download_url ?? null;
		response.expires_at = download?.expires_at ?? null;
	}
	return response;
}
