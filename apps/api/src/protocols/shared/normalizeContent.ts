// Purpose: Shared content normalization for text-generate protocols.
// Why: Keep IR conversion consistent across chat/completions/responses/messages.
// How: Maps OpenAI-style content parts to IR content parts.

import type { IRContentPart } from "@core/ir";

function asString(value: unknown): string {
	if (typeof value === "string") return value;
	if (value === null || value === undefined) return "";
	return String(value);
}

function normalizeImageUrl(url: unknown): { source: "data" | "url"; data: string; detail?: string } | null {
	if (typeof (url as any)?.b64_json === "string") {
		return {
			source: "data",
			data: (url as any).b64_json,
			detail: typeof (url as any)?.detail === "string" ? (url as any).detail : undefined,
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
	const data = isDataUrl ? resolved.split(",")[1] ?? "" : resolved;
	const detail = typeof (url as any)?.detail === "string" ? (url as any).detail : undefined;
	return { source: isDataUrl ? "data" : "url", data, detail };
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
			return { type: "text", text: asString(part.text) };
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
			} as IRContentPart;
		}

		if (part?.type === "input_audio") {
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
				format: part.input_audio?.format || part.format,
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
