// Purpose: Mistral realtime transcription (Voxtral Realtime WebSocket) for the realtime relay.
// Why: Streaming speech-to-text has no reply turns: the client streams microphone audio and
//      Mistral streams the transcript back, billed per minute of audio sent.
// How: The relay opens the provider socket with the gateway's key, forwards 16 kHz PCM as
//      input_audio.append, meters the audio it forwards and, on session.end, flushes and ends
//      the stream so the final transcription.done arrives before the bill settles.

import { getBindings } from "@/runtime/env";
import { MISTRAL_API_KEY_ENVS } from "@providers/mistral/config";

export const MISTRAL_REALTIME_PROVIDER = "mistral";
// Mistral only accepts pcm_s16le; session.created reports 16 kHz (recorded 2026-10-27).
export const MISTRAL_REALTIME_INPUT_SAMPLE_RATE = 16_000;
// Mistral documents no session limit; this is the gateway's cap.
export const MISTRAL_REALTIME_MAX_DURATION_SECONDS = 60 * 60;

// Public model id -> Mistral's model id. Mistral's dated ids are also accepted as input.
const MISTRAL_REALTIME_MODELS: Record<string, string> = {
	"mistral/voxtral-mini-transcribe-realtime-3": "voxtral-mini-transcribe-realtime-3-0",
	"mistral/voxtral-mini-transcribe-realtime": "voxtral-mini-transcribe-realtime-2602",
};

// Session fields a client may change. audio_format stays fixed: the relay meters 16 kHz PCM.
const MISTRAL_CLIENT_SESSION_FIELDS = [
	"language",
	"target_streaming_delay_ms",
	"context_bias",
	"diarize",
	"turn_detection",
] as const;

export function isMistralRealtimeModel(model: string | null | undefined): boolean {
	return /^(mistral|mistralai)\/voxtral-[a-z0-9-]*realtime/i.test(String(model ?? "").trim());
}

export function resolveMistralRealtimeKey(): string {
	const bindings = getBindings() as Record<string, unknown>;
	for (const name of MISTRAL_API_KEY_ENVS) {
		const value = String(bindings[name] ?? "").trim();
		if (value) return value;
	}
	return "";
}

export function mistralRealtimeUrl(providerModel: string): string {
	const bindings = getBindings() as Record<string, unknown>;
	const base = String(bindings.MISTRAL_BASE_URL || "https://api.mistral.ai").replace(/\/+$/, "").replace(/\/v1$/, "");
	return `${base.replace(/^http/, "ws")}/v1/audio/transcriptions/realtime?model=${encodeURIComponent(providerModel)}`;
}

/** mistral/voxtral-mini-transcribe-realtime-3 (or voxtral-mini-transcribe-realtime-3-0) */
export function mistralCanonicalModel(model: string): string {
	const trimmed = model.trim().toLowerCase().replace(/^mistralai\//, "mistral/");
	const bare = trimmed.replace(/^mistral\//, "");
	const known = Object.entries(MISTRAL_REALTIME_MODELS).find(([, native]) => native === bare);
	return known ? known[0] : `mistral/${bare}`;
}

export function mistralProviderModel(model: string): string {
	const canonical = mistralCanonicalModel(model);
	return MISTRAL_REALTIME_MODELS[canonical] ?? canonical.replace(/^mistral\//, "");
}

/**
 * A client session.update, reduced to the fields a client may set. Returns
 * null when nothing allowed is left.
 */
export function sanitizeMistralSessionUpdate(message: Record<string, unknown>): Record<string, unknown> | null {
	const session = message.session && typeof message.session === "object" ? message.session as Record<string, unknown> : {};
	const allowed: Record<string, unknown> = {};
	for (const field of MISTRAL_CLIENT_SESSION_FIELDS) {
		if (session[field] !== undefined) allowed[field] = session[field];
	}
	return Object.keys(allowed).length > 0 ? { type: "session.update", session: allowed } : null;
}

/**
 * Records Mistral's own count from transcription.done. It reports whole
 * seconds (8 for an 8.74 s clip, recorded 2026-10-27), so the relay's metered
 * audio stays the bill and Mistral's count is only a floor.
 */
export function applyMistralTranscriptionUsage(
	usage: Record<string, unknown>,
	event: Record<string, unknown>,
): Record<string, unknown> {
	const reported = event.usage && typeof event.usage === "object" ? event.usage as Record<string, unknown> : null;
	const seconds = Number(reported?.prompt_audio_seconds);
	if (!reported || !Number.isFinite(seconds) || seconds < 0) return usage;
	const providerMs = seconds * 1000;
	const meteredMs = Number(usage.input_audio_ms ?? 0);
	return {
		...usage,
		provider_audio_seconds: seconds,
		input_audio_ms: Math.max(Number.isFinite(meteredMs) ? meteredMs : 0, providerMs),
	};
}
