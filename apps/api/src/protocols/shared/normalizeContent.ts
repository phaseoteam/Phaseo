// Purpose: Shared content normalization for text-generate protocols.
// Why: Keep IR conversion consistent across chat/completions/responses/messages.
// How: Maps OpenAI-style content parts to IR content parts.

import type { IRCacheControl, IRContentPart } from "@core/ir";

function asString(value: unknown): string {
	if (typeof value === "string") return value;
	if (value === null || value === undefined) return "";
	return String(value);
}

function resolveImageMimeType(value: unknown): string | undefined {
	if (!value || typeof value !== "object") return undefined;
	const direct =
		typeof (value as any)?.mime_type === "string"
			? (value as any).mime_type
			: typeof (value as any)?.mimeType === "string"
				? (value as any).mimeType
				: typeof (value as any)?.media_type === "string"
					? (value as any).media_type
					: undefined;
	if (direct) return direct;
	const nested = (value as any)?.image_url;
	if (!nested || typeof nested !== "object") return undefined;
	return typeof nested?.mime_type === "string"
		? nested.mime_type
		: typeof nested?.mimeType === "string"
			? nested.mimeType
			: typeof nested?.media_type === "string"
				? nested.media_type
				: undefined;
}

function resolveAudioFormat(value: unknown): string | undefined {
	if (!value || typeof value !== "object") return undefined;
	const direct =
		typeof (value as any)?.format === "string"
			? (value as any).format
			: typeof (value as any)?.audio_format === "string"
				? (value as any).audio_format
				: undefined;
	if (direct) return direct;
	const nested = (value as any)?.input_audio;
	if (!nested || typeof nested !== "object") return undefined;
	return typeof nested?.format === "string" ? nested.format : undefined;
}

function parseDataUrl(value: string): { data: string; mimeType?: string } {
	const commaIndex = value.indexOf(",");
	if (commaIndex < 0) return { data: "" };
	const metadata = value.slice("data:".length, commaIndex);
	const mimeCandidate = metadata.split(";")[0]?.trim();
	const mimeType = mimeCandidate && mimeCandidate.includes("/") ? mimeCandidate : undefined;
	return {
		data: value.slice(commaIndex + 1),
		mimeType,
	};
}

function nonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function mimeTypeFromFilename(filename: string | undefined): string | undefined {
	const extension = filename?.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
	if (extension === "pdf") return "application/pdf";
	if (extension === "txt") return "text/plain";
	if (extension === "md") return "text/markdown";
	if (extension === "csv") return "text/csv";
	return undefined;
}

/**
 * Map an OpenAI Chat `file` part (`{type:"file", file:{file_data|file_id, filename}}`)
 * or a Responses `input_file` part (`file_data`, `file_url` or `file_id` on the
 * part itself) to an IR file part. `file_data` is a base64 data URL in both
 * APIs; a bare base64 string is kept as data without a media type.
 * https://platform.openai.com/docs/api-reference/chat/create
 * https://platform.openai.com/docs/api-reference/responses/create
 */
function normalizeFilePart(part: any): IRContentPart | null {
	const source = part?.type === "file" && part.file && typeof part.file === "object" ? part.file : part;
	const filename = nonEmptyString(source?.filename);
	const cacheControl = normalizePartCacheControl(part);
	const common = {
		...(filename ? { filename } : {}),
		...(cacheControl ? { cacheControl } : {}),
	};
	const fileData = nonEmptyString(source?.file_data);
	if (fileData) {
		if (/^data:/i.test(fileData)) {
			const parsed = parseDataUrl(fileData);
			if (!parsed.data) return null;
			const mimeType = parsed.mimeType ?? mimeTypeFromFilename(filename);
			return { type: "file", source: "data", data: parsed.data, ...(mimeType ? { mimeType } : {}), ...common };
		}
		if (/^https?:\/\//i.test(fileData)) {
			return { type: "file", source: "url", data: fileData, ...common };
		}
		const mimeType = mimeTypeFromFilename(filename);
		return { type: "file", source: "data", data: fileData, ...(mimeType ? { mimeType } : {}), ...common };
	}
	const fileUrl = nonEmptyString(source?.file_url);
	if (fileUrl) return { type: "file", source: "url", data: fileUrl, ...common };
	const fileId = nonEmptyString(source?.file_id);
	if (fileId) return { type: "file", source: "id", data: fileId, ...common };
	return null;
}

/**
 * Read a content block's or tool definition's cache mark. OpenAI's
 * `prompt_cache_breakpoint` wins over an Anthropic-style `cache_control`
 * when a block carries both. Executors translate the IR mark into each
 * provider's own field, or drop it where the provider has none.
 */
export function normalizePartCacheControl(part: any): IRCacheControl | undefined {
	const breakpoint = part?.prompt_cache_breakpoint;
	if (breakpoint && typeof breakpoint === "object" && !Array.isArray(breakpoint)) {
		// OpenAI's per-breakpoint lifetime ("30m" or "12h", GPT-5.6+ Responses).
		const breakpointTtl = typeof breakpoint.ttl === "string" && breakpoint.ttl.trim()
			? breakpoint.ttl.trim()
			: undefined;
		return {
			type: "prompt_cache_breakpoint",
			mode: breakpoint.mode,
			...(breakpointTtl ? { ttl: breakpointTtl } : {}),
		};
	}
	const cacheControl = part?.cache_control ?? part?.cacheControl;
	if (!cacheControl || typeof cacheControl !== "object" || Array.isArray(cacheControl)) return undefined;
	const type = typeof cacheControl.type === "string" && cacheControl.type.trim()
		? cacheControl.type.trim()
		: "ephemeral";
	const ttl = typeof cacheControl.ttl === "string" && cacheControl.ttl.trim()
		? cacheControl.ttl.trim()
		: undefined;
	return { type, ...(ttl ? { ttl } : {}) };
}

const TEXT_PART_TYPES = new Set(["text", "input_text", "output_text"]);

/**
 * Tool results keep their text in the IR (`content`, the text parts joined)
 * and, when the client sent an array of content parts, the parts themselves.
 * Encoders send the parts where the upstream accepts structured tool results
 * and the joined text elsewhere, never a JSON string of the array. A cache mark
 * on any part is kept (the last one wins) so the breakpoint can be re-emitted.
 */
export function normalizeToolResultContent(content: unknown): { content: string; cacheControl?: IRCacheControl; parts?: IRContentPart[] } {
	if (typeof content === "string") return { content };
	if (content === null || content === undefined) return { content: "" };
	if (
		Array.isArray(content) &&
		content.length > 0 &&
		content.every((part) => part && typeof part === "object" && typeof part.type === "string")
	) {
		const marks = content.map(normalizePartCacheControl).filter((mark): mark is IRCacheControl => Boolean(mark));
		const cacheControl = marks.length > 0 ? marks[marks.length - 1] : undefined;
		const allText = content.every((part) => TEXT_PART_TYPES.has(part.type) && typeof part.text === "string");
		const text = content
			.filter((part) => TEXT_PART_TYPES.has(part.type) && typeof part.text === "string")
			.map((part) => part.text)
			.join("");
		// A marked all-text result is sent as one marked text part, as before.
		if (allText && cacheControl) return { content: text, cacheControl };
		return {
			content: text,
			parts: normalizeOpenAIContent(content),
			...(cacheControl ? { cacheControl } : {}),
		};
	}
	return { content: JSON.stringify(content) };
}

const IMAGE_DETAILS = new Set(["auto", "low", "high", "original"]);

function imageDetail(value: unknown): "auto" | "low" | "high" | "original" | undefined {
	return typeof value === "string" && IMAGE_DETAILS.has(value) ? value as "auto" | "low" | "high" | "original" : undefined;
}

const AUDIO_FORMAT_BY_MIME: Record<string, "wav" | "mp3" | "flac" | "m4a" | "ogg" | "pcm16"> = {
	"audio/wav": "wav",
	"audio/x-wav": "wav",
	"audio/wave": "wav",
	"audio/mpeg": "mp3",
	"audio/mp3": "mp3",
	"audio/flac": "flac",
	"audio/x-flac": "flac",
	"audio/mp4": "m4a",
	"audio/m4a": "m4a",
	"audio/x-m4a": "m4a",
	"audio/aac": "m4a",
	"audio/ogg": "ogg",
	"audio/l16": "pcm16",
};

function isGeminiFileUri(value: string): boolean {
	return /^files\/[^/]+$/.test(value) || /^https:\/\/generativelanguage\.googleapis\.com\//i.test(value);
}

/**
 * A Gemini-shaped part (`inlineData` / `inline_data`, `fileData` / `file_data`
 * or a bare `{ text }`), as Google's SDKs build them. Without this it would
 * reach the model as the text "[object Object]".
 * https://ai.google.dev/api/caching#Part
 */
function normalizeGeminiPart(part: any): IRContentPart | null {
	if (!part || typeof part !== "object" || Array.isArray(part) || part.type !== undefined) return null;
	if (typeof part.text === "string" && Object.keys(part).every((key) => key === "text")) {
		return { type: "text", text: part.text };
	}
	const inline = part.inlineData ?? part.inline_data;
	if (inline && typeof inline === "object" && typeof inline.data === "string" && inline.data) {
		const mimeType = nonEmptyString(inline.mimeType ?? inline.mime_type)?.toLowerCase() ?? "application/octet-stream";
		if (mimeType.startsWith("image/")) return { type: "image", source: "data", data: inline.data, mimeType };
		if (mimeType.startsWith("audio/")) {
			const format = AUDIO_FORMAT_BY_MIME[mimeType.split(";")[0]!.trim()];
			return { type: "audio", source: "data", data: inline.data, ...(format ? { format } : {}) };
		}
		// The IR keeps video as a URL; a data URL carries inline bytes.
		if (mimeType.startsWith("video/")) return { type: "video", source: "url", url: `data:${mimeType};base64,${inline.data}` };
		return { type: "file", source: "data", data: inline.data, mimeType };
	}
	const file = part.fileData ?? part.file_data;
	const fileUri = file && typeof file === "object" ? nonEmptyString(file.fileUri ?? file.file_uri) : undefined;
	if (fileUri) {
		const mimeType = nonEmptyString(file.mimeType ?? file.mime_type)?.toLowerCase();
		const geminiFile = isGeminiFileUri(fileUri);
		if (mimeType?.startsWith("image/")) {
			return { type: "image", source: geminiFile ? "id" : "url", data: fileUri, mimeType };
		}
		// A Files API upload belongs to the Gemini API project that made it, so
		// audio and video uploads stay file references that only Google AI
		// Studio is sent, not URLs another provider would try to fetch.
		if (geminiFile && (mimeType?.startsWith("audio/") || mimeType?.startsWith("video/"))) {
			return { type: "file", source: "id", data: fileUri, mimeType };
		}
		if (mimeType?.startsWith("audio/")) {
			const format = AUDIO_FORMAT_BY_MIME[mimeType];
			return { type: "audio", source: "url", data: fileUri, ...(format ? { format } : {}) };
		}
		if (mimeType?.startsWith("video/") || /^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(fileUri)) {
			return { type: "video", source: "url", url: fileUri };
		}
		return { type: "file", source: geminiFile ? "id" : "url", data: fileUri, ...(mimeType ? { mimeType } : {}) };
	}
	return null;
}

function normalizeImageUrl(
	url: unknown,
): { source: "data" | "url"; data: string; detail?: string; mimeType?: string } | null {
	const explicitMimeType = resolveImageMimeType(url);
	if (typeof (url as any)?.b64_json === "string") {
		return {
			source: "data",
			data: (url as any).b64_json,
			detail: typeof (url as any)?.detail === "string" ? (url as any).detail : undefined,
			mimeType: explicitMimeType,
		};
	}

	const resolved = typeof url === "string"
		? url
		: typeof (url as any)?.url === "string"
			? (url as any).url
			: typeof (url as any)?.image_url === "string"
				? (url as any).image_url
				: typeof (url as any)?.image_url?.url === "string"
					? (url as any).image_url.url
					: null;
	if (!resolved) return null;
	const isDataUrl = resolved.startsWith("data:");
	const parsedDataUrl = isDataUrl ? parseDataUrl(resolved) : null;
	const data = parsedDataUrl ? parsedDataUrl.data : resolved;
	const detail = typeof (url as any)?.detail === "string" ? (url as any).detail : undefined;
	const mimeType = parsedDataUrl?.mimeType ?? explicitMimeType;
	return {
		source: isDataUrl ? "data" : "url",
		data,
		detail,
		mimeType,
	};
}

export function normalizeOpenAIContent(content: string | any[]): IRContentPart[] {
	if (typeof content === "string") {
		return [{ type: "text", text: content }];
	}

	if (!Array.isArray(content)) {
		const fallback = asString(content);
		return fallback ? [{ type: "text", text: fallback }] : [];
	}

	return content.map((part) => {
		if (part?.type === "text" || part?.type === "input_text" || part?.type === "output_text") {
			return {
				type: "text",
				text: asString(part.text),
				cacheControl: normalizePartCacheControl(part),
			};
		}

		if (
			part?.type === "image_url" ||
			part?.type === "input_image" ||
			part?.type === "output_image" ||
			part?.type === "image"
		) {
			// Responses `input_image` carries `detail` and `file_id` on the part
			// itself, next to a string `image_url`.
			// https://platform.openai.com/docs/api-reference/responses/create
			const partDetail = imageDetail(part.detail);
			const fileId = nonEmptyString(part.file_id);
			if (fileId && part.image_url == null && part.url == null) {
				return {
					type: "image",
					source: "id",
					data: fileId,
					...(partDetail ? { detail: partDetail } : {}),
					cacheControl: normalizePartCacheControl(part),
				} as IRContentPart;
			}
			const normalized = normalizeImageUrl(part.image_url ?? part.url ?? part);
			if (!normalized) return { type: "text", text: asString(part) };
			return {
				type: "image",
				source: normalized.source,
				data: normalized.data,
				detail: imageDetail(normalized.detail) ?? partDetail,
				mimeType: normalized.mimeType,
				cacheControl: normalizePartCacheControl(part),
			} as IRContentPart;
		}

		const geminiPart = normalizeGeminiPart(part);
		if (geminiPart) return geminiPart;

		if (
			part?.type === "input_audio" ||
			part?.type === "output_audio" ||
			part?.type === "audio" ||
			part?.type === "audio_url"
		) {
			const audioData = part.input_audio?.data || part.data;
			const audioUrl =
				part.input_audio?.url ||
				part.audio_url?.url ||
				part.audio_url ||
				part.url;
			return {
				type: "audio",
				source: audioUrl ? "url" : "data",
				data: audioUrl || audioData,
				format: resolveAudioFormat(part),
				cacheControl: normalizePartCacheControl(part),
			} as IRContentPart;
		}

		if (part?.type === "input_file" || part?.type === "file") {
			const normalized = normalizeFilePart(part);
			if (normalized) return normalized;
			return {
				type: "provider_block",
				block: { ...part },
			} as IRContentPart;
		}

		if (part?.type === "input_video" || part?.type === "video_url") {
			const url =
				(typeof part.video_url === "string" ? part.video_url : undefined) ||
				part.video_url?.url ||
				(typeof part.url === "string" ? part.url : undefined) ||
				part.url?.url;
			if (!url) {
				return { type: "text", text: asString(part) };
			}
			return {
				type: "video",
				source: "url",
				url,
			} as IRContentPart;
		}

		return { type: "text", text: asString(part) };
	});
}
