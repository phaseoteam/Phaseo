// Purpose: Download a media URL a client sent and return it as base64.
// Why: Several providers take images, audio or documents only as inline bytes,
//      so the gateway fetches public URLs for them (SSRF-safe, size-capped).
// How: fetchPublicMedia, retried once with browser-like headers when the first
//      answer isn't binary (or, for a document, text other than a web page),
//      then the MIME type from the response or the URL.

import type { ExecutorResult, ExecutorUpstreamTiming } from "@executors/types";
import { fetchPublicMedia, type PublicMediaResponse } from "@core/public-media-fetch";

const RETRY_FETCH_USER_AGENT =
	"Mozilla/5.0 (compatible; Phaseo-Gateway/1.0; +https://phaseo.app)";

export function parseBase64DataUrl(value: string): { mimeType: string; data: string } | null {
	const match = /^data:([^;,]+)?;base64,(.+)$/i.exec(value);
	if (!match) return null;
	return {
		mimeType: match[1] || "application/octet-stream",
		data: match[2] || "",
	};
}

export function isHttpUrl(value: string): boolean {
	return /^https?:\/\//i.test(value);
}

export function encodeBase64(buffer: ArrayBuffer | Uint8Array): string {
	const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
	const maybeBuffer = (globalThis as any)?.Buffer;
	if (maybeBuffer) {
		return maybeBuffer.from(bytes).toString("base64");
	}
	let binary = "";
	const chunkSize = 0x8000;
	for (let i = 0; i < bytes.length; i += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
	}
	const btoaFn = (globalThis as any)?.btoa;
	if (typeof btoaFn === "function") {
		return btoaFn(binary);
	}
	throw new Error("No base64 encoder available");
}

export function normalizeContentType(value: string | null | undefined, fallback: string): string {
	const base = (value || "").split(";")[0]?.trim().toLowerCase();
	return base || fallback;
}

function looksBinaryMimeType(value: string): boolean {
	const normalized = value.toLowerCase();
	return (
		normalized.startsWith("image/") ||
		normalized.startsWith("audio/") ||
		normalized.startsWith("video/") ||
		normalized === "application/pdf" ||
		normalized === "application/octet-stream"
	);
}

export function inferMimeTypeFromUrl(url: string): string | null {
	try {
		const pathname = new URL(url).pathname.toLowerCase();
		if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
		if (pathname.endsWith(".png")) return "image/png";
		if (pathname.endsWith(".webp")) return "image/webp";
		if (pathname.endsWith(".gif")) return "image/gif";
		if (pathname.endsWith(".svg")) return "image/svg+xml";
		if (pathname.endsWith(".mp3")) return "audio/mpeg";
		if (pathname.endsWith(".wav")) return "audio/wav";
		if (pathname.endsWith(".ogg")) return "audio/ogg";
		if (pathname.endsWith(".flac")) return "audio/flac";
		if (pathname.endsWith(".m4a")) return "audio/mp4";
		if (pathname.endsWith(".mp4")) return "video/mp4";
		if (pathname.endsWith(".mov")) return "video/quicktime";
		if (pathname.endsWith(".webm")) return "video/webm";
		if (pathname.endsWith(".pdf")) return "application/pdf";
		if (pathname.endsWith(".txt")) return "text/plain";
	} catch {
		// Best-effort inference only.
	}
	return null;
}

async function fetchRemoteMediaWithRetry(
	url: string,
	fallbackMimeType: string,
	maxBytes: number,
	upstreamTiming?: ExecutorUpstreamTiming,
): Promise<PublicMediaResponse | null> {
	const first = await fetchPublicMedia({ url, maxBytes, upstreamTiming }).catch((error) => {
		if (error instanceof Error && error.message === "remote_media_too_large") throw error;
		return null;
	});
	const firstMime = normalizeContentType(first?.contentType, fallbackMimeType);
	if (first && (looksBinaryMimeType(firstMime) || isDocumentTextAnswer(fallbackMimeType, firstMime))) {
		return first;
	}

	const accept =
		fallbackMimeType.startsWith("image/")
			? "image/*,*/*;q=0.8"
			: fallbackMimeType.startsWith("audio/")
				? "audio/*,*/*;q=0.8"
				: fallbackMimeType.startsWith("video/")
					? "video/*,*/*;q=0.8"
					: "*/*";
	return fetchPublicMedia({
		url,
		maxBytes,
		upstreamTiming,
		headers: {
			Accept: accept,
			"User-Agent": RETRY_FETCH_USER_AGENT,
		},
	}).catch((error) => {
		if (error instanceof Error && error.message === "remote_media_too_large") throw error;
		return null;
	});
}

/**
 * A document URL (anything but image, audio or video) that answers with
 * text: a plain-text, Markdown, CSV or similar document, kept as it is. A
 * web page is still retried, as for media, since it is often a bot check.
 */
function isDocumentTextAnswer(requestedMimeType: string, answeredMimeType: string): boolean {
	const requested = requestedMimeType.toLowerCase();
	if (requested.startsWith("image/") || requested.startsWith("audio/") || requested.startsWith("video/")) return false;
	return answeredMimeType.startsWith("text/") && answeredMimeType !== "text/html";
}

export type RemoteMediaResult =
	| { ok: true; mimeType: string; data: string; byteLength: number }
	| { ok: false; reason: "fetch_failed" | "too_large" };

/**
 * Fetch a public URL and return its bytes as base64 with a MIME type: the
 * response's own, or one inferred from the URL when the response has none
 * or a generic one. Callers check the type.
 */
export async function fetchRemoteMediaInline(
	url: string,
	options: { fallbackMimeType: string; maxBytes: number; upstreamTiming?: ExecutorUpstreamTiming },
): Promise<RemoteMediaResult> {
	let res: PublicMediaResponse | null;
	try {
		res = await fetchRemoteMediaWithRetry(url, options.fallbackMimeType, options.maxBytes, options.upstreamTiming);
	} catch {
		return { ok: false, reason: "too_large" };
	}
	if (!res) return { ok: false, reason: "fetch_failed" };
	// The URL's extension only stands in for a missing or generic type; a page
	// served as text/html stays text/html, so callers can refuse it.
	const normalizedRawMime = normalizeContentType(res.contentType, "");
	const mimeType = normalizedRawMime && normalizedRawMime !== "application/octet-stream"
		? normalizedRawMime
		: inferMimeTypeFromUrl(url) ?? (normalizedRawMime || options.fallbackMimeType);
	return { ok: true, mimeType, data: encodeBase64(res.bytes), byteLength: res.bytes.byteLength };
}

/**
 * A 400 for media the client sent that cannot be delivered to this route
 * (a URL the gateway cannot fetch, the wrong type, too large). Terminal, so
 * routing does not retry the same input elsewhere.
 */
export function mediaInputErrorResult(code: string, message: string, requestId: string): ExecutorResult {
	return {
		kind: "completed",
		terminal: true,
		localClientError: true,
		upstream: Response.json({ error: code, message, request_id: requestId }, { status: 400 }),
		bill: { cost_cents: 0, currency: "USD" },
	};
}

export function shortMediaUrl(url: string): string {
	return url.length > 120 ? `${url.slice(0, 117)}...` : url;
}
