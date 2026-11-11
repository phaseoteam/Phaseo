// Purpose: ElevenLabs Scribe Live (realtime speech-to-text WebSocket) for the realtime relay.
// Why: Scribe Live is a different protocol from the Eleven Realtime voice models on the same
//      provider: settings are fixed by query parameters when the socket opens, audio is sent as
//      input_audio_chunk messages, and ElevenLabs reports no usage in-band (it bills audio time).
// How: The relay opens the socket at the client's first audio chunk with the settings the client
//      sent in session.update, meters the 16 kHz PCM it forwards, translates ElevenLabs events to
//      the transcription.* events used for Mistral, and on session.end commits the last segment
//      and waits for its transcript before the bill settles.

import { getBindings } from "@/runtime/env";
import { ELEVENLABS_PROVIDER } from "./elevenlabs-realtime";

/**
 * Internal provider kind for Scribe Live sessions. The catalogue provider (and
 * the session row's provider) stays "elevenlabs"; the relay needs to tell this
 * protocol apart from the Eleven Realtime voice models.
 */
export const ELEVENLABS_SCRIBE_REALTIME_PROVIDER = "elevenlabs-scribe";
export const ELEVENLABS_SCRIBE_CATALOGUE_PROVIDER = ELEVENLABS_PROVIDER;
export const ELEVENLABS_SCRIBE_INPUT_SAMPLE_RATE = 16_000;
// ElevenLabs documents no session limit; this is the gateway's cap (as for Mistral).
export const ELEVENLABS_SCRIBE_MAX_DURATION_SECONDS = 60 * 60;
/** How long the relay waits for session_started after opening the socket. */
export const ELEVENLABS_SCRIBE_SETUP_TIMEOUT_MS = 10_000;
/** Client audio held while the socket opens at the first chunk (session_started arrives in ~0.3 s). */
export const ELEVENLABS_SCRIBE_CONNECT_AUDIO_BUFFER_MS = 5_000;
/**
 * ElevenLabs closes the session when a commit has less uncommitted audio than
 * this (recorded 2026-11-11: commit_throttled, "at least 0.3s"), so the final
 * commit is only sent above it.
 */
export const ELEVENLABS_SCRIBE_MIN_COMMIT_AUDIO_MS = 300;
// Bounds the transcript the relay keeps for transcription.done.
const MAX_TRANSCRIPT_CHARS = 256 * 1024;
const MAX_PREVIOUS_TEXT_CHARS = 1_000;
const MAX_SECONDARY_LANGUAGES = 10;

// Public model id -> ElevenLabs model id.
const ELEVENLABS_SCRIBE_REALTIME_MODELS: Record<string, string> = {
	"eleven-labs/scribe-v3-live": "scribe_v3_live",
};

export function isElevenLabsScribeRealtimeModel(model: string | null | undefined): boolean {
	const normalized = String(model ?? "").trim().toLowerCase().replace(/^elevenlabs\//, "eleven-labs/");
	if (ELEVENLABS_SCRIBE_REALTIME_MODELS[normalized]) return true;
	const bare = normalized.replace(/^eleven-labs\//, "");
	return Object.values(ELEVENLABS_SCRIBE_REALTIME_MODELS).includes(bare);
}

/** eleven-labs/scribe-v3-live (or scribe_v3_live) */
export function elevenLabsScribeCanonicalModel(model: string): string {
	const bare = model.trim().toLowerCase().replace(/^(eleven-labs|elevenlabs)\//, "");
	const known = Object.entries(ELEVENLABS_SCRIBE_REALTIME_MODELS).find(([, native]) => native === bare);
	return known ? known[0] : `eleven-labs/${bare.replace(/_/g, "-")}`;
}

export function elevenLabsScribeProviderModel(model: string): string {
	const canonical = elevenLabsScribeCanonicalModel(model);
	return ELEVENLABS_SCRIBE_REALTIME_MODELS[canonical] ?? canonical.replace(/^eleven-labs\//, "").replace(/-/g, "_");
}

/** Settings a client may choose; ElevenLabs fixes them when the socket opens. */
export type ElevenLabsScribeSettings = {
	language?: string;
	secondary_languages?: string[];
	commit_strategy?: "manual" | "vad" | "turn_prediction";
	vad_silence_threshold_secs?: number;
	vad_threshold?: number;
	min_speech_duration_ms?: number;
	min_silence_duration_ms?: number;
	include_timestamps?: boolean;
	include_language_detection?: boolean;
	multilang_mode?: boolean;
	diarize?: boolean;
	no_verbatim?: boolean;
	filter_background_audio?: boolean;
	previous_text?: string;
};

/**
 * Billed by ElevenLabs as surcharges on top of the audio-hour price (keyterms,
 * the keyterm library, transcript editing) or with no published price (entity
 * detection and redaction). Phaseo has no meter for them yet, so they are
 * rejected rather than forwarded unbilled.
 */
const PAID_ADD_ON_FIELDS = new Set([
	"keyterms",
	"keyterm_library",
	"transcript_edit",
	"entity_detection",
	"entity_redaction",
	"entity_redaction_mode",
]);

const LANGUAGE_CODE = /^[a-z]{2,3}$/i;

type SettingCheck = (value: unknown) => boolean;
const isBool: SettingCheck = (value) => typeof value === "boolean";
const isLanguage: SettingCheck = (value) => typeof value === "string" && LANGUAGE_CODE.test(value.trim());
const numberIn = (min: number, max: number): SettingCheck =>
	(value) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const integerIn = (min: number, max: number): SettingCheck =>
	(value) => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

const SETTING_CHECKS: Record<keyof ElevenLabsScribeSettings, SettingCheck> = {
	language: isLanguage,
	secondary_languages: (value) => Array.isArray(value) && value.length <= MAX_SECONDARY_LANGUAGES && value.every(isLanguage),
	commit_strategy: (value) => value === "manual" || value === "vad" || value === "turn_prediction",
	// ElevenLabs accepts 0.192 to 3.0 s.
	vad_silence_threshold_secs: numberIn(0.192, 3),
	vad_threshold: numberIn(0, 1),
	min_speech_duration_ms: integerIn(0, 10_000),
	min_silence_duration_ms: integerIn(0, 10_000),
	include_timestamps: isBool,
	include_language_detection: isBool,
	multilang_mode: isBool,
	diarize: isBool,
	no_verbatim: isBool,
	filter_background_audio: isBool,
	previous_text: (value) => typeof value === "string" && value.trim().length > 0 && value.length <= MAX_PREVIOUS_TEXT_CHARS,
};

export type ElevenLabsScribeSettingsResult =
	| { ok: true; settings: ElevenLabsScribeSettings }
	| { ok: false; reason: string; param?: string };

/**
 * Validates a client session.update and merges it into the settings so far.
 * The whole update is rejected when any field is unknown, invalid, a paid
 * add-on, or the audio format the relay meters, or when the combined settings
 * are ones ElevenLabs refuses (it closes the connection on them).
 */
export function mergeElevenLabsScribeSessionUpdate(
	current: ElevenLabsScribeSettings,
	message: Record<string, unknown>,
): ElevenLabsScribeSettingsResult {
	const session = message.session;
	if (!session || typeof session !== "object" || Array.isArray(session)) {
		return { ok: false, reason: "realtime_session_update_not_accepted" };
	}
	const next: Record<string, unknown> = { ...current };
	let changed = false;
	for (const [field, value] of Object.entries(session as Record<string, unknown>)) {
		if (value === undefined) continue;
		if (PAID_ADD_ON_FIELDS.has(field)) return { ok: false, reason: "realtime_transcription_option_not_supported", param: field };
		const check = SETTING_CHECKS[field as keyof ElevenLabsScribeSettings];
		if (!check) return { ok: false, reason: "realtime_session_update_not_accepted", param: field };
		if (value === null) {
			delete next[field];
		} else {
			if (!check(value)) return { ok: false, reason: "realtime_session_update_not_accepted", param: field };
			next[field] = field === "language" ? String(value).trim().toLowerCase()
				: field === "secondary_languages" ? (value as string[]).map((code) => code.trim().toLowerCase())
				: value;
		}
		changed = true;
	}
	if (!changed) return { ok: false, reason: "realtime_session_update_not_accepted" };
	// ElevenLabs refuses both combinations with invalid_request and closes the connection.
	if (next.filter_background_audio === true && next.include_timestamps === true) {
		return { ok: false, reason: "realtime_session_update_not_accepted", param: "filter_background_audio" };
	}
	if (next.filter_background_audio === true && next.diarize === true) {
		return { ok: false, reason: "realtime_session_update_not_accepted", param: "filter_background_audio" };
	}
	return { ok: true, settings: next as ElevenLabsScribeSettings };
}

function elevenLabsBaseUrl(): string {
	const bindings = getBindings() as Record<string, unknown>;
	return String(bindings.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io").replace(/\/+$/, "");
}

/**
 * The Scribe Live socket URL. Phaseo always sends 16 kHz PCM and defaults to
 * VAD commits, because a relay client only streams client.audio (ElevenLabs'
 * own default, manual, needs commits; send input_audio.commit for those).
 */
export function elevenLabsScribeRealtimeUrl(
	providerModel: string,
	settings: ElevenLabsScribeSettings,
): string {
	const query = new URLSearchParams({
		model_id: providerModel,
		audio_format: `pcm_${ELEVENLABS_SCRIBE_INPUT_SAMPLE_RATE}`,
		commit_strategy: settings.commit_strategy ?? "vad",
	});
	if (settings.language) query.set("language_code", settings.language);
	for (const code of settings.secondary_languages ?? []) query.append("secondary_languages", code);
	for (const field of [
		"vad_silence_threshold_secs",
		"vad_threshold",
		"min_speech_duration_ms",
		"min_silence_duration_ms",
		"include_timestamps",
		"include_language_detection",
		"multilang_mode",
		"diarize",
		"no_verbatim",
		"filter_background_audio",
	] as const) {
		const value = settings[field];
		if (value !== undefined) query.set(field, String(value));
	}
	const base = elevenLabsBaseUrl().replace(/^http/, "ws");
	return `${base}/v1/speech-to-text/realtime?${query.toString()}`;
}

/** One input_audio_chunk; previous_text may only ride on the first. */
export function elevenLabsScribeAudioChunk(audio: string, previousText?: string | null) {
	return {
		message_type: "input_audio_chunk",
		audio_base_64: audio,
		commit: false,
		sample_rate: ELEVENLABS_SCRIBE_INPUT_SAMPLE_RATE,
		...(previousText ? { previous_text: previousText } : {}),
	};
}

/** Commits the uncommitted audio (ElevenLabs' documented form: empty audio, commit true). */
export function elevenLabsScribeCommit() {
	return { message_type: "input_audio_chunk", audio_base_64: "", commit: true, sample_rate: ELEVENLABS_SCRIBE_INPUT_SAMPLE_RATE };
}

// ElevenLabs closes the connection after each of these (event reference, 2026-11-11).
const ERROR_MESSAGE_TYPES = new Set([
	"error",
	"auth_error",
	"quota_exceeded",
	"transcriber_error",
	"input_error",
	"invalid_request",
	"commit_throttled",
	"unaccepted_terms",
	"rate_limited",
	"queue_overflow",
	"resource_exhausted",
	"session_time_limit_exceeded",
	"chunk_size_exceeded",
	"insufficient_audio_activity",
]);

export function isElevenLabsScribeError(messageType: string): boolean {
	return ERROR_MESSAGE_TYPES.has(messageType);
}

export type ElevenLabsScribeTranslation = {
	kind: "session_started" | "partial" | "committed" | "follow_up" | "error" | "other";
	events: Array<Record<string, unknown>>;
};

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/**
 * Translates one ElevenLabs event into the transcription.* events Phaseo sends
 * for streaming transcription, and keeps what the end of the session needs:
 * the committed transcript and whether every commit's follow-up events
 * (word timestamps, speaker labels) have arrived.
 */
export class ElevenLabsScribeTranscript {
	committed = 0;
	private timestamped = 0;
	private diarized = 0;
	private text = "";
	private truncated = false;
	private language: string | null = null;
	/** Text of the segment in progress (the latest partial since the last commit). */
	pendingText = "";

	constructor(private readonly settings: ElevenLabsScribeSettings) {}

	private get expectsTimestamps() {
		return this.settings.include_timestamps === true || this.settings.include_language_detection === true;
	}

	/** Every commit so far has its committed text and follow-up events. */
	get complete(): boolean {
		return (!this.expectsTimestamps || this.timestamped >= this.committed)
			&& (this.settings.diarize !== true || this.diarized >= this.committed);
	}

	translate(event: Record<string, unknown>): ElevenLabsScribeTranslation {
		const type = typeof event.message_type === "string" ? event.message_type : "";
		const text = typeof event.text === "string" ? event.text : "";
		if (type === "session_started") {
			const config = record(event.config);
			return { kind: "session_started", events: [{
				type: "session.created",
				session: { id: event.session_id ?? null, ...config, commit_strategy: this.settings.commit_strategy ?? "vad" },
			}] };
		}
		if (type === "partial_transcript") {
			this.pendingText = text;
			return { kind: "partial", events: [{
				type: "transcription.partial",
				text,
				...(typeof event.turn_probability === "number" ? { turn_probability: event.turn_probability } : {}),
				...(Array.isArray(event.words) ? { words: event.words } : {}),
			}] };
		}
		if (type === "committed_transcript") {
			const index = this.committed;
			this.committed += 1;
			this.pendingText = "";
			const events: Array<Record<string, unknown>> = [];
			if (text) {
				const delta = this.text && !/\s$/.test(this.text) && !/^\s/.test(text) ? ` ${text}` : text;
				this.append(delta);
				events.push({ type: "transcription.text.delta", text: delta });
			}
			events.push({ type: "transcription.segment", segment_index: index, text });
			return { kind: "committed", events };
		}
		if (type === "committed_transcript_with_timestamps") {
			const index = this.timestamped;
			this.timestamped += 1;
			const events: Array<Record<string, unknown>> = [];
			const language = typeof event.language_code === "string" && event.language_code ? event.language_code : null;
			if (language && language !== this.language) {
				this.language = language;
				events.push({ type: "transcription.language", audio_language: language });
			}
			events.push({
				type: "transcription.segment.words",
				segment_index: index,
				text,
				...(language ? { language } : {}),
				words: Array.isArray(event.words) ? event.words : [],
			});
			return { kind: "follow_up", events };
		}
		if (type === "diarized_transcript") {
			const index = typeof event.segment_index === "number" ? event.segment_index : this.diarized;
			this.diarized += 1;
			return { kind: "follow_up", events: [{
				type: "transcription.segment.speakers",
				segment_index: index,
				text,
				words: Array.isArray(event.words) ? event.words : [],
			}] };
		}
		if (type === "speakers_merged") {
			return { kind: "other", events: [{
				type: "transcription.speakers_merged",
				from_speaker_id: event.from_speaker_id ?? null,
				to_speaker_id: event.to_speaker_id ?? null,
			}] };
		}
		if (isElevenLabsScribeError(type)) {
			return { kind: "error", events: [{
				type: "error",
				error: { type, message: typeof event.error === "string" ? event.error : type, provider: ELEVENLABS_PROVIDER },
			}] };
		}
		// Anything else (for example a warning) is passed on unchanged.
		return { kind: "other", events: [event] };
	}

	done(): Record<string, unknown> {
		return {
			type: "transcription.done",
			text: this.text,
			...(this.language ? { language: this.language } : {}),
			segment_count: this.committed,
			...(this.truncated ? { truncated: true } : {}),
		};
	}

	private append(delta: string) {
		if (this.truncated) return;
		if (this.text.length + delta.length > MAX_TRANSCRIPT_CHARS) {
			this.truncated = true;
			return;
		}
		this.text += delta;
	}
}
