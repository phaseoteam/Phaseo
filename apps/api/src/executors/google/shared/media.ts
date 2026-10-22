import type { IRContentPart } from "@core/ir";
import type { ExecutorUpstreamTiming } from "@executors/types";
import {
	fetchRemoteMediaInline,
	inferMimeTypeFromUrl,
	isHttpUrl,
	parseBase64DataUrl,
} from "@executors/_shared/media/remote-media";

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
	upstreamTiming?: ExecutorUpstreamTiming;
};

function audioMimeFromFormat(format?: string): string {
	if (!format) return "audio/wav";
	return AUDIO_MIME_BY_FORMAT[format] || `audio/${format}`;
}

/**
 * YouTube links go to Gemini as `file_data.file_uri`; Google fetches the
 * video itself. Downloading them would only return the watch page's HTML.
 * https://ai.google.dev/gemini-api/docs/video-understanding#youtube
 */
export function isYouTubeUrl(url: string): boolean {
	try {
		const host = new URL(url).hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, "");
		return host === "youtube.com" || host === "youtu.be";
	} catch {
		return false;
	}
}

function isGeminiFileReference(value: string): boolean {
	return /^files\/[^/]+$/.test(value) || /^https:\/\/generativelanguage\.googleapis\.com\//i.test(value);
}

function geminiFileError(message: string): Error {
	return Object.assign(new Error(message), { code: "unsupported_parameter", param: "file_id" });
}

function mediaFamily(mimeType: string): string {
	return mimeType.toLowerCase().split("/")[0] ?? "";
}

async function mediaUrlToGeminiPart(
	url: string,
	fallbackMimeType: string,
	maxRemoteAssetBytes: number,
	upstreamTiming?: ExecutorUpstreamTiming,
): Promise<GeminiPart> {
	const parsedData = parseBase64DataUrl(url);
	if (parsedData) {
		return {
			inline_data: {
				mime_type: parsedData.mimeType,
				data: parsedData.data,
			},
		};
	}

	const fileData = {
		file_data: {
			mime_type: fallbackMimeType,
			file_uri: url,
		},
	};
	if (!isHttpUrl(url) || isYouTubeUrl(url) || isGeminiFileReference(url)) return fileData;

	const fetched = await fetchRemoteMediaInline(url, {
		fallbackMimeType,
		maxBytes: maxRemoteAssetBytes,
		upstreamTiming,
	}).catch(() => null);
	if (!fetched || fetched.ok === false) return fileData;
	// An image, audio or video URL that answers with a web page (or another
	// kind of media) is left for Google to fetch rather than inlined as text.
	const expectedFamily = mediaFamily(fallbackMimeType);
	if ((expectedFamily === "image" || expectedFamily === "audio" || expectedFamily === "video")
		&& mediaFamily(fetched.mimeType) !== expectedFamily) {
		return fileData;
	}
	return {
		inline_data: {
			mime_type: fetched.mimeType,
			data: fetched.data,
		},
	};
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
		if (part.source === "id") {
			if (!isGeminiFileReference(part.data)) {
				throw geminiFileError("Gemini cannot read an image by another provider's file_id; send the image as a URL or base64 data.");
			}
			return { file_data: { mime_type: part.mimeType || "image/jpeg", file_uri: part.data } };
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

	if (part.type === "file") {
		return irFilePartToGeminiPart(part, maxRemoteAssetBytes, options.upstreamTiming);
	}

	// Another provider's native block (Claude thinking, server tool blocks)
	// has no Gemini form.
	if (part.type === "provider_block") return { text: "" };

	return { text: String(part) };
}

/**
 * Gemini takes file bytes as `inline_data` and remote or uploaded files as
 * `file_data.file_uri`. Another provider's `file_id` is not a Gemini file:
 * the attempt fails (routing then tries a route that can read it) rather
 * than the model answering without the document.
 * https://ai.google.dev/gemini-api/docs/document-processing
 */
async function irFilePartToGeminiPart(
	part: Extract<IRContentPart, { type: "file" }>,
	maxRemoteAssetBytes: number,
	upstreamTiming?: ExecutorUpstreamTiming,
): Promise<GeminiPart> {
	const mimeType = part.mimeType || "application/pdf";
	if (part.source === "data") {
		return { inline_data: { mime_type: mimeType, data: part.data } };
	}
	if (part.source === "url") {
		return mediaUrlToGeminiPart(part.data, part.mimeType || inferMimeTypeFromUrl(part.data) || "application/pdf", maxRemoteAssetBytes, upstreamTiming);
	}
	if (isGeminiFileReference(part.data)) {
		return { file_data: { mime_type: mimeType, file_uri: part.data } };
	}
	throw geminiFileError("Gemini cannot read another provider's file_id; send the file as file_data or a URL.");
}

export async function irPartsToGeminiParts(
	parts: IRContentPart[],
	options: GeminiPartOptions = {},
): Promise<GeminiPart[]> {
	const mapped: GeminiPart[] = [];
	for (const part of parts) {
		if (part.type === "provider_block") continue;
		mapped.push(await irPartToGeminiPart(part, options));
	}
	return mapped;
}
