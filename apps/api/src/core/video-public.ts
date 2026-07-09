import { getBindings } from "@/runtime/env";

export const DEFAULT_VIDEO_POLL_SECONDS = 20;
export const DEFAULT_VIDEO_DOWNLOAD_TTL_SECONDS = 900;
export const MAX_VIDEO_DOWNLOAD_TTL_SECONDS = 3600;
const DEFAULT_GATEWAY_PUBLIC_BASE_URL = "https://api.phaseo.ai";

function normalizeText(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function base64UrlEncodeText(value: string): string {
	return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecodeText(value: string): string | null {
	try {
		const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
		const padded = normalized + "===".slice((normalized.length + 3) % 4);
		return atob(padded);
	} catch {
		return null;
	}
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
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

function resolveVideoDownloadSigningSecret(): string | null {
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	return normalizeText(bindings.VIDEO_DOWNLOAD_SIGNING_SECRET) ?? normalizeText(bindings.KEY_PEPPER);
}

export function resolveGatewayPublicBaseUrl(requestUrl?: string | null): string {
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const configured = normalizeText(bindings.GATEWAY_PUBLIC_BASE_URL);
	if (configured) {
		try {
			return new URL(configured).toString().replace(/\/+$/, "");
		} catch {
			// fall through
		}
	}
	if (requestUrl) {
		try {
			return new URL(requestUrl).origin;
		} catch {
			// fall through
		}
	}
	return DEFAULT_GATEWAY_PUBLIC_BASE_URL;
}

export function buildVideoPollingUrl(baseUrlOrRequestUrl: string, id: string): string {
	return new URL(`/v1/videos/${encodeURIComponent(id)}`, resolveGatewayPublicBaseUrl(baseUrlOrRequestUrl)).toString();
}

export function buildVideoContentUrl(baseUrlOrRequestUrl: string, id: string, index: number): string {
	const url = new URL(`/v1/videos/${encodeURIComponent(id)}/content`, resolveGatewayPublicBaseUrl(baseUrlOrRequestUrl));
	if (index > 0) url.searchParams.set("index", String(index));
	return url.toString();
}

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
	return "queued";
}

export async function issueSignedVideoDownloadUrl(args: {
	requestUrl?: string | null;
	baseUrl?: string | null;
	workspaceId: string;
	videoId: string;
	index?: number;
	ttlSeconds?: number | null;
	disposition?: "attachment" | "inline";
}): Promise<{ download_url: string; expires_at: number } | null> {
	const secret = resolveVideoDownloadSigningSecret();
	if (!secret) return null;
	const ttlSeconds = Math.max(
		60,
		Math.min(MAX_VIDEO_DOWNLOAD_TTL_SECONDS, Math.trunc(args.ttlSeconds ?? DEFAULT_VIDEO_DOWNLOAD_TTL_SECONDS)),
	);
	const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
	const disposition = args.disposition === "inline" ? "inline" : "attachment";
	const index = typeof args.index === "number" && Number.isFinite(args.index) ? Math.max(0, Math.trunc(args.index)) : 0;
	const tokenPayload = base64UrlEncodeText(JSON.stringify({
		workspace_id: args.workspaceId,
		video_id: args.videoId,
		index,
		disposition,
	}));
	const signature = await hmacSha256Hex(secret, `${tokenPayload}.${expiresAt}`);
	const url = new URL(
		buildVideoContentUrl(args.baseUrl ?? args.requestUrl ?? DEFAULT_GATEWAY_PUBLIC_BASE_URL, args.videoId, index),
	);
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
	const disposition = payload.disposition === "inline" ? "inline" : "attachment";
	const indexRaw = typeof payload.index === "number" && Number.isFinite(payload.index) ? payload.index : 0;
	if (!workspaceId || !videoId) return null;
	return {
		workspaceId,
		videoId,
		index: Math.max(0, Math.trunc(indexRaw)),
		disposition,
	};
}
