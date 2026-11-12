// Purpose: Send audio given by URL as base64 to OpenAI-compatible providers.
// Why: OpenAI's `input_audio` part takes base64 `data` and a `format` only; it
//      has no URL form. Only a few hosts document an audio URL part.
//      https://platform.openai.com/docs/api-reference/chat/create
// How: Download each audio URL (SSRF-safe, size-capped) and replace it with
//      base64 data and a format taken from the response's MIME type.

import type { IRChatRequest, IRContentPart, IRMessage } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import {
	fetchRemoteMediaInline,
	isHttpUrl,
	mediaInputErrorResult,
	parseBase64DataUrl,
	shortMediaUrl,
} from "@executors/_shared/media/remote-media";

// Hosts whose quirks send audio URLs in their own documented part
// (Chutes and Baseten `audio_url`, Reka `audio_url`).
const AUDIO_URL_PROVIDERS = new Set(["chutes", "baseten", "reka"]);

export const MAX_INLINE_AUDIO_BYTES = 20 * 1024 * 1024;

type AudioFormat = NonNullable<Extract<IRContentPart, { type: "audio" }>["format"]>;

const AUDIO_FORMAT_BY_MIME: Record<string, AudioFormat> = {
	"audio/wav": "wav",
	"audio/x-wav": "wav",
	"audio/wave": "wav",
	"audio/vnd.wave": "wav",
	"audio/mpeg": "mp3",
	"audio/mp3": "mp3",
	"audio/flac": "flac",
	"audio/x-flac": "flac",
	"audio/mp4": "m4a",
	"audio/m4a": "m4a",
	"audio/x-m4a": "m4a",
	"audio/aac": "m4a",
	"audio/ogg": "ogg",
	"application/ogg": "ogg",
};

class AudioInlineError extends Error {
	constructor(readonly code: string, message: string) {
		super(message);
	}
}

export function providerTakesAudioUrls(providerId: string | undefined): boolean {
	return Boolean(providerId && AUDIO_URL_PROVIDERS.has(providerId));
}

function needsInlining(part: IRContentPart): boolean {
	return part.type === "audio" && part.source === "url";
}

function messageParts(message: IRMessage): IRContentPart[] {
	if (message.role === "tool") return message.toolResults.flatMap((result) => result.parts ?? []);
	return message.content;
}

async function inlineAudio(
	part: Extract<IRContentPart, { type: "audio" }>,
	upstreamTiming: ExecutorExecuteArgs["upstreamTiming"],
): Promise<IRContentPart> {
	const dataUrl = parseBase64DataUrl(part.data);
	let mimeType: string;
	let data: string;
	if (dataUrl) {
		mimeType = dataUrl.mimeType.toLowerCase();
		data = dataUrl.data;
	} else {
		if (!isHttpUrl(part.data)) {
			throw new AudioInlineError("invalid_audio_url", `Audio URL ${shortMediaUrl(part.data)} is not an http(s) URL.`);
		}
		const fetched = await fetchRemoteMediaInline(part.data, {
			fallbackMimeType: "audio/wav",
			maxBytes: MAX_INLINE_AUDIO_BYTES,
			upstreamTiming,
		});
		if (fetched.ok === false) {
			throw new AudioInlineError(
				fetched.reason === "too_large" ? "audio_too_large" : "invalid_audio_url",
				fetched.reason === "too_large"
					? `Audio ${shortMediaUrl(part.data)} is larger than 20 MB; send a shorter clip.`
					: `Could not download audio ${shortMediaUrl(part.data)}. This provider takes audio as base64 data, so the gateway must be able to fetch the URL.`,
			);
		}
		mimeType = fetched.mimeType;
		data = fetched.data;
	}
	const format = AUDIO_FORMAT_BY_MIME[mimeType] ?? part.format;
	if (!format) {
		throw new AudioInlineError(
			"unsupported_audio_type",
			`Audio ${shortMediaUrl(part.data)} is ${mimeType}; send wav, mp3, flac, m4a or ogg audio, or set input_audio.format.`,
		);
	}
	return { ...part, source: "data", data, format };
}

async function inlineParts(parts: IRContentPart[], upstreamTiming: ExecutorExecuteArgs["upstreamTiming"]): Promise<IRContentPart[]> {
	const next: IRContentPart[] = [];
	for (const part of parts) {
		next.push(part.type === "audio" && part.source === "url" ? await inlineAudio(part, upstreamTiming) : part);
	}
	return next;
}

/**
 * The request with every audio URL inlined as base64 `input_audio`, unless the
 * provider takes audio URLs itself; or a 400 result when a URL cannot be used.
 */
export async function inlineAudioUrlsForProvider(
	ir: IRChatRequest,
	args: Pick<ExecutorExecuteArgs, "providerId" | "requestId" | "upstreamTiming">,
): Promise<{ ok: true; ir: IRChatRequest } | { ok: false; result: ExecutorResult }> {
	if (providerTakesAudioUrls(args.providerId)) return { ok: true, ir };
	if (!ir.messages.some((message) => messageParts(message).some(needsInlining))) return { ok: true, ir };
	try {
		const messages: IRMessage[] = [];
		for (const message of ir.messages) {
			if (!messageParts(message).some(needsInlining)) {
				messages.push(message);
			} else if (message.role === "tool") {
				const toolResults = [];
				for (const result of message.toolResults) {
					toolResults.push(result.parts ? { ...result, parts: await inlineParts(result.parts, args.upstreamTiming) } : result);
				}
				messages.push({ ...message, toolResults });
			} else {
				messages.push({ ...message, content: await inlineParts(message.content, args.upstreamTiming) } as IRMessage);
			}
		}
		return { ok: true, ir: { ...ir, messages } };
	} catch (error) {
		if (error instanceof AudioInlineError) {
			return { ok: false, result: mediaInputErrorResult(error.code, error.message, args.requestId) };
		}
		throw error;
	}
}
