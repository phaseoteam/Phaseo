// Purpose: ElevenLabs Realtime (OpenAI-compatible voice WebSocket) for the realtime relay.
// Why: ElevenLabs sends no usage in-band (response.done.usage is always null) and bills
//      connected minutes pro rata plus LLM tokens, reported later on the conversation.
// How: The relay meters connected time during the call; at settlement the conversation's
//      reported charge is read back and used as a floor, with its token counts billed.

import { getBindings } from "@/runtime/env";

export const ELEVENLABS_PROVIDER = "elevenlabs";
export const ELEVENLABS_MODEL_PREFIX = "eleven-labs/";
// ElevenLabs requires at least 60 s and defaults to 600 s (recorded 2026-10-22).
export const ELEVENLABS_MIN_MAX_DURATION_SECONDS = 60;
export const ELEVENLABS_DEFAULT_MAX_DURATION_SECONDS = 600;
// Asked of ElevenLabs beyond the gateway cap, so the gateway's own end (with
// its warnings) comes first.
export const ELEVENLABS_MAX_DURATION_MARGIN_SECONDS = 60;
export const ELEVENLABS_DEFAULT_VOICE = "brian";
export const ELEVENLABS_INPUT_SAMPLE_RATE = 24_000;

export function resolveElevenLabsKey(): string {
	const bindings = getBindings() as Record<string, unknown>;
	return String(bindings.ELEVENLABS_API_KEY ?? "").trim();
}

function elevenLabsBaseUrl(): string {
	const bindings = getBindings() as Record<string, unknown>;
	return String(bindings.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io").replace(/\/+$/, "");
}

/**
 * ElevenLabs ignores this query parameter (recorded 2026-10-23: ?model=eleven_realtime_v1_max
 * ran and billed Mini); the model is chosen by session.model in session.update.
 */
export function elevenLabsRealtimeUrl(providerModel: string): string {
	const base = elevenLabsBaseUrl().replace(/^http/, "ws");
	return `${base}/v1/convai/realtime?model=${encodeURIComponent(providerModel)}`;
}

/** eleven-labs/eleven-realtime-v1-mini <-> eleven_realtime_v1_mini */
export function elevenLabsProviderModel(model: string): string {
	return model.trim().replace(/^(eleven-labs|elevenlabs)\//, "").replace(/-/g, "_");
}

export function elevenLabsCanonicalModel(model: string): string {
	const bare = model.trim().replace(/^(eleven-labs|elevenlabs)\//, "").replace(/_/g, "-");
	return `${ELEVENLABS_MODEL_PREFIX}${bare}`;
}

export function buildElevenLabsSessionUpdate(args: {
	model: string;
	voice?: string | null;
	instructions?: string | null;
	maxDurationSeconds?: number | null;
}) {
	return {
		type: "session.update",
		session: {
			type: "realtime",
			model: args.model,
			...(args.instructions ? { instructions: args.instructions } : {}),
			output_modalities: ["audio"],
			...(args.maxDurationSeconds
				? { max_duration_seconds: Math.max(ELEVENLABS_MIN_MAX_DURATION_SECONDS, Math.round(args.maxDurationSeconds)) }
				: {}),
			audio: {
				input: { format: { type: "audio/pcm", rate: ELEVENLABS_INPUT_SAMPLE_RATE } },
				output: { format: { type: "audio/pcm", rate: ELEVENLABS_INPUT_SAMPLE_RATE }, voice: args.voice || ELEVENLABS_DEFAULT_VOICE },
			},
		},
	};
}

export type ElevenLabsConversationCost =
	| { ready: false; status: string }
	| {
		ready: true;
		status: string;
		costNanos: number;
		audioMs: number;
		inputTextTokens: number;
		outputTextTokens: number;
	};

function num(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/**
 * Reads what ElevenLabs charged for a conversation from
 * GET /v1/convai/conversations/{id}. Not ready until the conversation is
 * finished and carries cost_fiat.
 */
export function parseElevenLabsConversationCost(body: unknown): ElevenLabsConversationCost {
	const conversation = record(body);
	const status = String(conversation.status ?? "");
	const metadata = record(conversation.metadata);
	const costFiat = metadata.cost_fiat;
	if ((status !== "done" && status !== "failed") || typeof costFiat !== "number" || !Number.isFinite(costFiat) || costFiat < 0) {
		return { ready: false, status };
	}
	const charging = record(metadata.charging);
	const audio = record(record(record(charging.platform_usage).category_usage).realtime_audio);
	let inputTextTokens = 0;
	let outputTextTokens = 0;
	// irreversible_generation is what was billed; initiated_generation repeats it.
	const models = record(record(record(charging.llm_usage).irreversible_generation).model_usage);
	for (const usage of Object.values(models)) {
		const item = record(usage);
		// Cache reads and writes are billed at the full input price (never less than cost).
		inputTextTokens += num(record(item.input).tokens) + num(record(item.input_cache_read).tokens) + num(record(item.input_cache_write).tokens);
		outputTextTokens += num(record(item.output_total).tokens);
	}
	return {
		ready: true,
		status,
		costNanos: Math.round(costFiat * 1_000_000_000),
		// realtime_audio.quantity is billed minutes, pro rata.
		audioMs: Math.round(num(audio.quantity) * 60_000),
		inputTextTokens,
		outputTextTokens,
	};
}

/**
 * Billed meters once ElevenLabs has reported the conversation: the longer of
 * the relay's connected time and ElevenLabs' billed minutes, plus its LLM
 * tokens. The reported charge itself is passed separately as a cost floor.
 */
export function applyElevenLabsConversationCost(
	usage: Record<string, unknown>,
	cost: Extract<ElevenLabsConversationCost, { ready: true }>,
): Record<string, unknown> {
	const localAudioMs = num(usage.session_audio_ms) || num(usage.audio_ms);
	const audioMs = Math.max(localAudioMs, cost.audioMs);
	return {
		...usage,
		session_audio_ms: audioMs,
		audio_ms: audioMs,
		input_text_tokens: cost.inputTextTokens,
		output_text_tokens: cost.outputTextTokens,
		provider_cost_nanos: cost.costNanos,
		provider_audio_ms: cost.audioMs,
		provider_cost_status: "reconciled",
	};
}

export async function fetchElevenLabsConversationCost(
	conversationId: string,
	fetchImpl: typeof fetch = fetch,
): Promise<ElevenLabsConversationCost> {
	if (!/^conv_[A-Za-z0-9]{8,64}$/.test(conversationId)) throw new Error("elevenlabs_conversation_id_invalid");
	const key = resolveElevenLabsKey();
	if (!key) throw new Error("elevenlabs_key_missing");
	const response = await fetchImpl(`${elevenLabsBaseUrl()}/v1/convai/conversations/${encodeURIComponent(conversationId)}`, {
		headers: { "xi-api-key": key },
		signal: AbortSignal.timeout(5_000),
	});
	if (response.status === 404) return { ready: false, status: "not_found" };
	if (!response.ok) throw new Error(`elevenlabs_conversation_http_${response.status}`);
	return parseElevenLabsConversationCost(await response.json());
}
