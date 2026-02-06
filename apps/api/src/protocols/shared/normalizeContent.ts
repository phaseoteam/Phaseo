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

export function normalizeCacheControl(raw: any): { type: "ephemeral"; ttl?: "5m" | "1h" } | undefined {
	if (!raw || typeof raw !== "object") return undefined;
	const typeRaw = typeof raw.type === "string"
		? raw.type
		: typeof raw.cache?.type === "string"
			? raw.cache.type
			: undefined;
	if (!typeRaw) return undefined;
	const normalized = typeRaw.toLowerCase() === "ehpemeral" ? "ephemeral" : typeRaw.toLowerCase();
	if (normalized !== "ephemeral") return undefined;
	const ttlRaw = typeof raw.ttl === "string"
		? raw.ttl
		: typeof raw.cache?.ttl === "string"
			? raw.cache.ttl
			: undefined;
	const ttlNormalized = typeof ttlRaw === "string" ? ttlRaw.toLowerCase() : undefined;
	const ttl = ttlNormalized === "5m" || ttlNormalized === "1h" ? ttlNormalized : undefined;
	return ttl ? { type: "ephemeral", ttl } : { type: "ephemeral" };
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
		if (part?.type === "text" || part?.type === "input_text") {
			const cacheControl = normalizeCacheControl(part.cache_control ?? part.cacheControl ?? part.cache);
			return cacheControl
				? { type: "text", text: asString(part.text), cacheControl }
				: { type: "text", text: asString(part.text) };
		}

		if (part?.type === "image_url" || part?.type === "input_image" || part?.type === "image") {
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
			return {
				type: "audio",
				source: "data",
				data: part.input_audio?.data || part.data,
				format: part.input_audio?.format || part.format,
			} as IRContentPart;
		}

	if (part?.type === "input_video") {
		const videoUrl =
			typeof part.video_url === "string"
				? part.video_url
				: typeof part.video_url?.url === "string"
					? part.video_url.url
					: typeof part.url === "string"
						? part.url
						: "";
		return {
			type: "video",
			source: "url",
			url: videoUrl,
		} as IRContentPart;
	}

		return { type: "text", text: asString(part) };
	});
}
