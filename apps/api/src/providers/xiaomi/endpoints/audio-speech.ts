// Purpose: Xiaomi MiMo V2 TTS adapter for gateway audio.speech.
// Why: Xiaomi exposes TTS via chat.completions + audio object, not /audio/speech.
// How: Maps audio.speech payload into Xiaomi chat format and normalizes audio data.

import type { AdapterResult, ProviderExecuteArgs } from "../../types";
import { AudioSpeechSchema, type AudioSpeechRequest } from "@core/schemas";
import { buildAdapterPayload } from "../../utils";
import {
	openAICompatHeaders,
	openAICompatUrl,
	resolveOpenAICompatKey,
} from "../../openai-compatible/config";

type XiaomiChatAudioResponse = {
	id?: string | null;
	data?: string | null;
	expires_at?: number | null;
	transcript?: string | null;
};

function truncateForLog(value: string | null | undefined, limit = 2000): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	if (trimmed.length <= limit) return trimmed;
	return `${trimmed.slice(0, limit)}...[truncated ${trimmed.length - limit} chars]`;
}

function extractVoiceCandidate(voice: AudioSpeechRequest["voice"]): string | undefined {
	if (typeof voice === "string") {
		const trimmed = voice.trim();
		return trimmed.length > 0 ? trimmed : undefined;
	}
	if (voice && typeof voice === "object") {
		const candidate =
			(voice as Record<string, any>).id ??
			(voice as Record<string, any>).voice_id ??
			(voice as Record<string, any>).voiceId ??
			(voice as Record<string, any>).name ??
			(voice as Record<string, any>).voiceName;
		if (typeof candidate === "string") {
			const trimmed = candidate.trim();
			return trimmed.length > 0 ? trimmed : undefined;
		}
	}
	return undefined;
}

function normalizeXiaomiVoice(voice: string | undefined): string {
	if (!voice) return "mimo_default";
	const trimmed = voice.trim();
	if (!trimmed) return "mimo_default";
	const lowered = trimmed.toLowerCase();
	if (lowered === "mimo_default") return "mimo_default";
	if (lowered === "default_zh") return "default_zh";
	if (lowered === "default_en") return "default_en";
	return trimmed;
}

function resolveAudioFormat(payload: AudioSpeechRequest): string {
	return payload.response_format ?? payload.format ?? "wav";
}

function mimeTypeForFormat(format: string): string {
	switch (format) {
		case "wav":
			return "audio/wav";
		case "mp3":
			return "audio/mpeg";
		case "aac":
			return "audio/aac";
		case "flac":
			return "audio/flac";
		case "opus":
			return "audio/opus";
		case "pcm":
			return "audio/pcm";
		default:
			return "application/octet-stream";
	}
}

function buildMessages(payload: AudioSpeechRequest): Array<{ role: "user" | "assistant"; content: string }> {
	const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
	const instruction = payload.instructions?.trim();
	if (instruction) {
		messages.push({ role: "user", content: instruction });
	}
	// Xiaomi requires the target synthesis text in an assistant-role message.
	messages.push({ role: "assistant", content: payload.input });
	return messages;
}

function extractXiaomiAudio(json: any): XiaomiChatAudioResponse | undefined {
	const choice = Array.isArray(json?.choices) ? json.choices[0] : undefined;
	const message = choice?.message;
	const audio = message?.audio;
	if (!audio || typeof audio !== "object") return undefined;
	return {
		id: typeof audio.id === "string" ? audio.id : null,
		data: typeof audio.data === "string" ? audio.data : null,
		expires_at: typeof audio.expires_at === "number" ? audio.expires_at : null,
		transcript: typeof audio.transcript === "string" ? audio.transcript : null,
	};
}

export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
	const keyInfo = await resolveOpenAICompatKey(args);
	const adapterPayload = buildAdapterPayload(
		AudioSpeechSchema,
		args.body,
		[],
	).adapterPayload as AudioSpeechRequest;
	const body: AudioSpeechRequest = {
		...adapterPayload,
		model: args.providerModelSlug || adapterPayload.model,
	};
	const format = resolveAudioFormat(body);
	const requestVoice = normalizeXiaomiVoice(extractVoiceCandidate(body.voice));
	const requestBody = {
		model: body.model,
		messages: buildMessages(body),
		audio: {
			format,
			voice: requestVoice,
		},
	};

	const res = await (args.upstreamTiming?.fetch ?? fetch)(openAICompatUrl(args.providerId, "/chat/completions"), {
		method: "POST",
		headers: openAICompatHeaders(args.providerId, keyInfo.key),
		body: JSON.stringify(requestBody),
	});

	if (!res.ok) {
		const responseText = await res.clone().text().catch(() => null);
		let responseJson: unknown = null;
		if (responseText) {
			try {
				responseJson = JSON.parse(responseText);
			} catch {
				responseJson = null;
			}
		}
		console.error("[xiaomi][audio.speech] upstream_non_2xx", {
			status: res.status,
			statusText: res.statusText || null,
			url: res.url || openAICompatUrl(args.providerId, "/chat/completions"),
			providerModel: body.model,
			requestShape: {
				hasInstructions: Boolean(body.instructions?.trim()),
				inputChars: typeof body.input === "string" ? body.input.length : 0,
				audioFormat: format,
				voice: requestVoice,
			},
			upstreamHeaders: {
				contentType: res.headers.get("content-type"),
				requestId: res.headers.get("x-request-id") ?? res.headers.get("request-id"),
				date: res.headers.get("date"),
				server: res.headers.get("server"),
			},
			upstreamRaw: truncateForLog(responseText),
			upstreamJson: responseJson,
		});
	}

	let normalized: Record<string, any> | undefined;
	let usage: Record<string, any> | undefined;
	if (res.ok) {
		const parsed = await res.clone().json().catch(() => null);
		if (parsed && typeof parsed === "object") {
			const audio = extractXiaomiAudio(parsed);
			usage = parsed.usage && typeof parsed.usage === "object" ? parsed.usage : undefined;
			normalized = {
				id: typeof parsed.id === "string" ? parsed.id : undefined,
				model: typeof parsed.model === "string" ? parsed.model : body.model,
				audio: {
					...(audio?.id ? { id: audio.id } : {}),
					...(audio?.data ? { data: audio.data } : {}),
					...(audio?.transcript ? { transcript: audio.transcript } : {}),
					...(audio?.expires_at != null ? { expires_at: audio.expires_at } : {}),
				},
				mime_type: mimeTypeForFormat(format),
				...(usage ? { usage } : {}),
			};
		}
	}

	const bill = {
		cost_cents: 0,
		currency: "USD" as const,
		usage: usage as any,
		upstream_id:
			res.headers.get("x-request-id") ??
			res.headers.get("request-id"),
		finish_reason: null,
	};

	return {
		kind: "completed",
		upstream: res,
		bill,
		normalized,
		keySource: keyInfo.source,
		byokKeyId: keyInfo.byokId,
	};
}
