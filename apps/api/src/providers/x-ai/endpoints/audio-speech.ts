// Purpose: xAI text-to-speech adapter for gateway audio.speech.
// Why: xAI's /v1/tts takes its own body (text, voice_id, language, output_format).
// How: Maps the speech request onto that body, checks xAI's documented limits first,
//      and decodes the JSON envelope into audio.

import type { AdapterResult, ProviderExecuteArgs } from "../../types";
import { AudioSpeechSchema, type AudioSpeechRequest } from "@core/schemas";
import { buildAdapterPayload } from "../../utils";
import {
	openAICompatHeaders,
	openAICompatUrl,
	resolveOpenAICompatKey,
} from "../../openai-compatible/config";
import { upstreamTestHeaders } from "@providers/shared/testing";

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
		if (typeof candidate === "string" && candidate.trim().length > 0) {
			return candidate.trim();
		}
	}
	return undefined;
}

function mimeTypeForCodec(codec: string): string {
	switch (codec) {
		case "wav":
			return "audio/wav";
		case "pcm":
			return "audio/pcm";
		case "mulaw":
			return "audio/basic";
		case "alaw":
			return "audio/basic";
		case "mp3":
		default:
			return "audio/mpeg";
	}
}

function invalidParameterResponse(param: string, message: string): Response {
	return new Response(
		JSON.stringify({ error: { type: "invalid_request_error", message, param } }),
		{ status: 400, headers: { "Content-Type": "application/json" } },
	);
}

// xAI's TTS reference gives speed a range of 0.7 to 1.5 (Phaseo's shared schema allows 0.25 to 4).
const XAI_MIN_SPEED = 0.7;
const XAI_MAX_SPEED = 1.5;

// xAI requires `language`; "auto" is its documented detection value. Callers can set a
// BCP-47 code through config.xai.language (or config["x-ai"].language).
function resolveLanguage(config: AudioSpeechRequest["config"]): string {
	const options = (config as Record<string, any> | undefined)?.xai ?? (config as Record<string, any> | undefined)?.["x-ai"];
	const language = typeof options?.language === "string" ? options.language.trim() : "";
	return language || "auto";
}

function decodeBase64Audio(value: string): ArrayBuffer | undefined {
	if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return undefined;
	try {
		const bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
		return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
	} catch {
		return undefined;
	}
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

	const rejected = (param: string, message: string): AdapterResult => ({
		kind: "completed",
		upstream: invalidParameterResponse(param, message),
		bill: { cost_cents: 0, currency: "USD", usage: undefined, upstream_id: null, finish_reason: null },
		keySource: keyInfo.source,
		byokKeyId: keyInfo.byokId,
	});

	const codec = body.response_format ?? body.format ?? "mp3";
	if (!["mp3", "wav", "pcm", "mulaw", "alaw"].includes(codec)) {
		return rejected(
			body.response_format ? "response_format" : "format",
			`xAI /v1/tts does not support codec "${codec}".`,
		);
	}
	if (typeof body.speed === "number" && (body.speed < XAI_MIN_SPEED || body.speed > XAI_MAX_SPEED)) {
		return rejected("speed", `xAI /v1/tts takes speed from ${XAI_MIN_SPEED} to ${XAI_MAX_SPEED}.`);
	}
	// xAI has no instructions field (style goes in inline speech tags), so instructions are not sent.
	const requestBody = {
		text: body.input,
		voice_id: extractVoiceCandidate(body.voice) ?? "eve",
		language: resolveLanguage(body.config),
		output_format: {
			codec,
		},
		...(typeof body.speed === "number" ? { speed: body.speed } : {}),
	};

	const res = await (args.upstreamTiming?.fetch ?? fetch)(openAICompatUrl(args.providerId, "/tts"), {
		method: "POST",
		headers: openAICompatHeaders(args.providerId, keyInfo.key, upstreamTestHeaders(args.meta)),
		body: JSON.stringify(requestBody),
	});

	const usage = {
		input_characters: typeof body.input === "string" ? body.input.length : 0,
		requests: 1,
	};

	let upstream = res;
	let normalized: AdapterResult["normalized"];
	if (res.ok && res.headers.get("content-type")?.toLowerCase().includes("json")) {
		let payload: Record<string, unknown> = {};
		try {
			const parsed: unknown = await res.clone().json();
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
				payload = parsed as Record<string, unknown>;
			}
		} catch {
		}
		const audio = typeof payload.audio === "string" && payload.audio.length > 0
			? decodeBase64Audio(payload.audio)
			: undefined;
		if (!audio) {
			upstream = new Response(JSON.stringify({
				error: {
					type: "upstream_protocol_error",
					message: "xAI /v1/tts returned a successful response without base64 audio.",
				},
			}), { status: 502, headers: { "Content-Type": "application/json" } });
		} else {
			const mimeType = typeof payload.content_type === "string"
				? payload.content_type
				: mimeTypeForCodec(codec);
			upstream = new Response(audio, {
				status: res.status,
				headers: { "Content-Type": mimeType },
			});
			normalized = {
				upstream: upstream.clone(),
				mime_type: mimeType,
				audio: {
					data: payload.audio,
					format: codec,
				},
				usage: {
					...usage,
					...(typeof payload.duration === "number" ? { output_seconds: payload.duration } : {}),
				},
			};
		}
	}

	return {
		kind: "completed",
		upstream,
		bill: {
			cost_cents: 0,
			currency: "USD" as const,
			usage,
			upstream_id:
				res.headers.get("x-request-id") ??
				res.headers.get("request-id"),
			finish_reason: null,
		},
		normalized,
		keySource: keyInfo.source,
		byokKeyId: keyInfo.byokId,
	};
}
