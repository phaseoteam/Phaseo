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
 * Tool results are stored as text in the IR. Array content that is all text
 * and carries a cache mark keeps its text and the mark (the last one wins), so
 * the breakpoint can be re-emitted upstream. Other arrays keep the historical
 * JSON encoding so existing prompts stay byte-identical.
 */
export function normalizeToolResultContent(content: unknown): { content: string; cacheControl?: IRCacheControl } {
	if (typeof content === "string") return { content };
	if (content === null || content === undefined) return { content: "" };
	if (
		Array.isArray(content) &&
		content.length > 0 &&
		content.every((part) => part && typeof part === "object" && TEXT_PART_TYPES.has(part.type) && typeof part.text === "string")
	) {
		const marks = content.map(normalizePartCacheControl).filter((mark): mark is IRCacheControl => Boolean(mark));
		if (marks.length > 0) {
			return {
				content: content.map((part) => part.text).join(""),
				cacheControl: marks[marks.length - 1],
			};
		}
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
