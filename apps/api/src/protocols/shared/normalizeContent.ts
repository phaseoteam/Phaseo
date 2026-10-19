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
		return {
			type: "prompt_cache_breakpoint",
			mode: breakpoint.mode,
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
			const normalized = normalizeImageUrl(part.image_url ?? part.url ?? part);
			if (!normalized) return { type: "text", text: asString(part) };
			return {
				type: "image",
				source: normalized.source,
				data: normalized.data,
				detail: normalized.detail,
				mimeType: normalized.mimeType,
				cacheControl: normalizePartCacheControl(part),
			} as IRContentPart;
		}

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
