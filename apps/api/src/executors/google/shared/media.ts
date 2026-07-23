import type { IRContentPart } from "@core/ir";
import type { ExecutorUpstreamTiming } from "@executors/types";

const DEFAULT_MAX_REMOTE_ASSET_BYTES = 20 * 1024 * 1024;
const RETRY_FETCH_USER_AGENT =
	"Mozilla/5.0 (compatible; Phaseo-Gateway/1.0; +https://phaseo.app)";

const AUDIO_MIME_BY_FORMAT: Record<string, string> = {
	wav: "audio/wav",
	mp3: "audio/mpeg",
	flac: "audio/flac",
	m4a: "audio/mp4",
	ogg: "audio/ogg",
	pcm16: "audio/L16",
	pcm24: "audio/L24",
};

type GeminiPart = {
	text?: string;
	thought?: boolean;
	thought_signature?: string;
	inline_data?: {
		mime_type: string;
		data: string;
	};
	file_data?: {
		mime_type?: string;
		file_uri: string;
	};
};

type GeminiPartOptions = {
	preserveReasoningAsThought?: boolean;
	maxRemoteAssetBytes?: number;
	upstreamTiming?: ExecutorUpstreamTiming;
};

function parseDataUrl(value: string): { mimeType: string; data: string } | null {
	const match = /^data:([^;,]+)?;base64,(.+)$/i.exec(value);
	if (!match) return null;
	return {
		mimeType: match[1] || "application/octet-stream",
		data: match[2] || "",
	};
}

function isHttpUrl(value: string): boolean {
	return /^https?:\/\//i.test(value);
}

function encodeBase64(buffer: ArrayBuffer): string {
	const maybeBuffer = (globalThis as any)?.Buffer;
	if (maybeBuffer) {
		return maybeBuffer.from(buffer).toString("base64");
	}
	const bytes = new Uint8Array(buffer);
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

function normalizeContentType(value: string | null | undefined, fallback: string): string {
	const base = (value || "").split(";")[0]?.trim();
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

function inferMimeTypeFromUrl(url: string): string | null {
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
		if (pathname.endsWith(".m4a")) return "audio/mp4";
		if (pathname.endsWith(".mp4")) return "video/mp4";
		if (pathname.endsWith(".mov")) return "video/quicktime";
		if (pathname.endsWith(".webm")) return "video/webm";
		if (pathname.endsWith(".pdf")) return "application/pdf";
	} catch {
		// Best-effort inference only.
	}
	return null;
}

function audioMimeFromFormat(format?: string): string {
	if (!format) return "audio/wav";
	return AUDIO_MIME_BY_FORMAT[format] || `audio/${format}`;
}

async function fetchRemoteMediaWithRetry(
	url: string,
	fallbackMimeType: string,
	upstreamTiming?: ExecutorUpstreamTiming,
): Promise<Response | null> {
	const first = await (
		upstreamTiming
			? upstreamTiming.fetch(url, undefined, "media")
			: fetch(url)
	).catch(() => null);
	const firstMime = normalizeContentType(first?.headers?.get("content-type"), fallbackMimeType);
	if (first?.ok && looksBinaryMimeType(firstMime)) {
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
	const retryInit: RequestInit = {
		headers: {
			Accept: accept,
			"User-Agent": RETRY_FETCH_USER_AGENT,
		},
	};
	return (
		upstreamTiming
			? upstreamTiming.fetch(url, retryInit, "media")
			: fetch(url, retryInit)
	).catch(() => null);
}

async function mediaUrlToGeminiPart(
	url: string,
	fallbackMimeType: string,
	maxRemoteAssetBytes: number,
	upstreamTiming?: ExecutorUpstreamTiming,
): Promise<GeminiPart> {
	const parsedData = parseDataUrl(url);
	if (parsedData) {
		return {
			inline_data: {
				mime_type: parsedData.mimeType,
				data: parsedData.data,
			},
		};
	}

	if (!isHttpUrl(url)) {
		return {
			file_data: {
				mime_type: fallbackMimeType,
				file_uri: url,
			},
		};
	}

	try {
		const res = await fetchRemoteMediaWithRetry(url, fallbackMimeType, upstreamTiming);
		if (!res || !res.ok) {
			return {
				file_data: {
					mime_type: fallbackMimeType,
					file_uri: url,
				},
			};
		}

		const contentLength = Number(res.headers.get("content-length") || "0");
		if (contentLength > 0 && contentLength > maxRemoteAssetBytes) {
			return {
				file_data: {
					mime_type: fallbackMimeType,
					file_uri: url,
				},
			};
		}

		const bytes = await res.arrayBuffer();
		if (bytes.byteLength > maxRemoteAssetBytes) {
			return {
				file_data: {
					mime_type: fallbackMimeType,
					file_uri: url,
				},
			};
		}

		const rawMimeHeader = res.headers.get("content-type");
		const normalizedRawMime = normalizeContentType(rawMimeHeader, "");
		const inferredMime = inferMimeTypeFromUrl(url);
		const chosenMime =
			normalizedRawMime &&
			looksBinaryMimeType(normalizedRawMime) &&
			normalizedRawMime !== "application/octet-stream"
				? normalizedRawMime
				: inferredMime ??
					normalizeContentType(rawMimeHeader, fallbackMimeType);
		return {
			inline_data: {
				mime_type: chosenMime,
				data: encodeBase64(bytes),
			},
		};
	} catch {
		return {
			file_data: {
				mime_type: fallbackMimeType,
				file_uri: url,
			},
		};
	}
}

export async function irPartToGeminiPart(
	part: IRContentPart,
	options: GeminiPartOptions = {},
): Promise<GeminiPart> {
	const maxRemoteAssetBytes = options.maxRemoteAssetBytes ?? DEFAULT_MAX_REMOTE_ASSET_BYTES;

	if (part.type === "reasoning_text") {
		if (options.preserveReasoningAsThought) {
			return {
				text: part.text,
				thought: true,
				thought_signature: part.thoughtSignature,
			};
		}
		return { text: part.text };
	}

	if (part.type === "text") {
		return { text: part.text };
	}

	if (part.type === "image") {
		if (part.source === "data") {
			return {
				inline_data: {
					mime_type: part.mimeType || "image/jpeg",
					data: part.data,
				},
			};
		}
		return mediaUrlToGeminiPart(part.data, part.mimeType || "image/jpeg", maxRemoteAssetBytes, options.upstreamTiming);
	}

	if (part.type === "audio") {
		const mimeType = audioMimeFromFormat(part.format);
		if (part.source === "data") {
			return {
				inline_data: {
					mime_type: mimeType,
					data: part.data,
				},
			};
		}
		return mediaUrlToGeminiPart(part.data, mimeType, maxRemoteAssetBytes, options.upstreamTiming);
	}

	if (part.type === "video") {
		return mediaUrlToGeminiPart(part.url, "video/mp4", maxRemoteAssetBytes, options.upstreamTiming);
	}

	return { text: String(part) };
}

export async function irPartsToGeminiParts(
	parts: IRContentPart[],
	options: GeminiPartOptions = {},
): Promise<GeminiPart[]> {
	const mapped: GeminiPart[] = [];
	for (const part of parts) {
		mapped.push(await irPartToGeminiPart(part, options));
	}
	return mapped;
}
