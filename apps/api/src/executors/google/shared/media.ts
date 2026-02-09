import type { IRContentPart } from "@core/ir";

const DEFAULT_MAX_REMOTE_ASSET_BYTES = 20 * 1024 * 1024;

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

function audioMimeFromFormat(format?: string): string {
	if (!format) return "audio/wav";
	return AUDIO_MIME_BY_FORMAT[format] || `audio/${format}`;
}

async function mediaUrlToGeminiPart(
	url: string,
	fallbackMimeType: string,
	maxRemoteAssetBytes: number,
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
		const res = await fetch(url);
		if (!res.ok) {
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

		return {
			inline_data: {
				mime_type: normalizeContentType(res.headers.get("content-type"), fallbackMimeType),
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
		return mediaUrlToGeminiPart(part.data, part.mimeType || "image/jpeg", maxRemoteAssetBytes);
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
		return mediaUrlToGeminiPart(part.data, mimeType, maxRemoteAssetBytes);
	}

	if (part.type === "video") {
		return mediaUrlToGeminiPart(part.url, "video/mp4", maxRemoteAssetBytes);
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
