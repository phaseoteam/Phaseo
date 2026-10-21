// Purpose: Native Mistral text-to-speech transport.
// Why: Mistral's Voxtral TTS contract differs from OpenAI's: voice_id instead of voice, and a JSON body with base64 audio instead of raw bytes.
// How: Maps the shared speech request to Mistral's JSON body and returns the decoded audio so clients see the same bytes as other speech providers.

import type { AdapterResult, ProviderExecuteArgs } from "../../types";
import { AudioSpeechSchema, type AudioSpeechRequest } from "@core/schemas";
import { buildAdapterPayload } from "../../utils";
import {
	openAICompatHeaders,
	openAICompatUrl,
	resolveOpenAICompatKey,
} from "../../openai-compatible/config";
import { upstreamTestHeaders } from "@providers/shared/testing";
import { computeBill } from "@pipeline/pricing/engine";

// Mistral accepts these output formats; aac and ogg are not offered.
const MIME_TYPES: Record<string, string> = {
	mp3: "audio/mpeg",
	wav: "audio/wav",
	flac: "audio/flac",
	opus: "audio/opus",
	pcm: "audio/pcm",
};

function errorResponse(status: number, message: string, param?: string): Response {
	return new Response(
		JSON.stringify({ error: { type: status === 400 ? "invalid_request_error" : "upstream_error", message, ...(param ? { param } : {}) } }),
		{ status, headers: { "Content-Type": "application/json" } },
	);
}

function resolveVoiceId(voice: AudioSpeechRequest["voice"]): string | undefined {
	if (typeof voice === "string") return voice.trim() || undefined;
	if (voice && typeof voice === "object") {
		for (const key of ["id", "voice_id", "voiceId", "name", "voiceName"]) {
			const candidate = (voice as Record<string, unknown>)[key];
			if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
		}
	}
	return undefined;
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

function pricedBill(characters: number, args: ProviderExecuteArgs, upstreamId: string | null) {
	if (!args.pricingCard || characters <= 0) {
		return { cost_cents: 0, currency: "USD" as const, usage: undefined, upstream_id: upstreamId, finish_reason: null };
	}
	const pricedUsage = computeBill({ requests: 1, input_characters: characters }, args.pricingCard);
	return {
		cost_cents: Number(pricedUsage?.pricing?.total_cents ?? 0),
		currency: "USD" as const,
		usage: pricedUsage as any,
		upstream_id: upstreamId,
		finish_reason: null,
	};
}

export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
	const keyInfo = await resolveOpenAICompatKey(args);
	const body = buildAdapterPayload(AudioSpeechSchema, args.body, []).adapterPayload as AudioSpeechRequest;
	const rejected = (response: Response): AdapterResult => ({
		kind: "completed",
		upstream: response,
		bill: pricedBill(0, args, null),
		keySource: keyInfo.source,
		byokKeyId: keyInfo.byokId,
	});

	const unsupported: Array<[string, unknown, string]> = [
		["speed", body.speed, "speed is not supported by Mistral text-to-speech."],
		["instructions", body.instructions, "instructions is not supported by Mistral text-to-speech."],
	];
	const invalid = unsupported.find(([, value]) => value !== undefined);
	if (invalid) return rejected(errorResponse(400, invalid[2], invalid[0]));
	if (body.stream_format === "sse") {
		return rejected(errorResponse(400, "Streaming speech is not supported for Mistral yet.", "stream_format"));
	}

	const format = body.response_format ?? body.format ?? "mp3";
	if (!(format in MIME_TYPES)) {
		return rejected(errorResponse(400, `${format} is not supported by Mistral text-to-speech; use one of ${Object.keys(MIME_TYPES).join(", ")}.`, "response_format"));
	}

	const payload: Record<string, unknown> = {
		model: args.providerModelSlug || body.model,
		input: body.input,
		response_format: format,
		stream: false,
	};
	const voiceId = resolveVoiceId(body.voice);
	if (voiceId) payload.voice_id = voiceId;

	const headers = openAICompatHeaders(args.providerId, keyInfo.key, upstreamTestHeaders(args.meta));
	const res = await (args.upstreamTiming?.fetch ?? fetch)(openAICompatUrl(args.providerId, "/audio/speech"), {
		method: "POST",
		headers,
		body: JSON.stringify(payload),
	});
	const upstreamId = res.headers.get("x-request-id") || res.headers.get("request-id");

	// Provider errors (and anything unbillable) go back to the client untouched.
	if (!res.ok) {
		return {
			kind: "completed",
			upstream: res,
			bill: pricedBill(0, args, upstreamId),
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
		};
	}

	const json = await res.clone().json().catch(() => undefined) as { audio_data?: unknown } | undefined;
	if (typeof json?.audio_data !== "string" || json.audio_data.length === 0) {
		return {
			kind: "completed",
			upstream: errorResponse(502, "Mistral returned no audio_data for the speech request."),
			bill: pricedBill(0, args, upstreamId),
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
		};
	}

	let audio: Uint8Array<ArrayBuffer>;
	try {
		audio = decodeBase64(json.audio_data);
	} catch {
		return {
			kind: "completed",
			upstream: errorResponse(502, "Mistral returned audio_data that is not valid base64."),
			bill: pricedBill(0, args, upstreamId),
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
		};
	}

	return {
		kind: "completed",
		upstream: new Response(audio, {
			status: 200,
			headers: {
				"Content-Type": MIME_TYPES[format],
				"Content-Length": String(audio.byteLength),
			},
		}),
		bill: pricedBill(body.input.length, args, upstreamId),
		keySource: keyInfo.source,
		byokKeyId: keyInfo.byokId,
	};
}
