// Purpose: Durable realtime voice session billing helpers.
// Why: Realtime audio needs wallet holds that can extend before final settlement.
// How: Creates session rows, reserves $5 increments, prices final usage, and settles atomically.

import { getBindings, getSupabaseAdmin } from "@/runtime/env";
import { syncWorkspaceUsageRollupForRequest } from "@core/workspace-usage-rollups";
import { loadPriceCard } from "@pipeline/pricing/loader";
import { computeBill } from "@pipeline/pricing/engine";
import { ulid } from "@pipeline/before/genId";
import { fetchGatewayContext } from "@pipeline/before/context";
import { buildProviderCandidatesWithDiagnostics } from "@pipeline/before/utils";
import { applyWorkspacePolicy, fetchWorkspacePolicy } from "@pipeline/before/workspacePolicy";

export const REALTIME_INITIAL_HOLD_NANOS = 5_000_000_000;
export const REALTIME_HOLD_INCREMENT_NANOS = 5_000_000_000;
export const REALTIME_EXTEND_THRESHOLD = 0.8;
export const REALTIME_GRACEFUL_STOP_THRESHOLD = 0.95;
export const REALTIME_MAX_DURATION_SECONDS = 25 * 60;
export const GOOGLE_REALTIME_MAX_DURATION_SECONDS = 15 * 60;
export const REALTIME_IDLE_TIMEOUT_SECONDS = 5 * 60;
export const REALTIME_MAX_WORKSPACE_SESSIONS = 8;
export const REALTIME_MAX_KEY_SESSIONS = 4;
export const REALTIME_MAX_USER_SESSIONS = 1;
export const REALTIME_MAX_CREATIONS_PER_MINUTE = 8;

const OPENAI_REALTIME_URL = "https://api.openai.com/v1/realtime";
const OPENAI_REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";
const XAI_REALTIME_URL = "wss://api.x.ai/v1/realtime";
const GOOGLE_AUTH_TOKENS_URL = "https://generativelanguage.googleapis.com/v1alpha/auth_tokens";
const GOOGLE_LIVE_CONSTRAINED_URL =
	"wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained";

export type RealtimeProvider = "openai" | "x-ai" | "spacex-ai" | "google-ai-studio";
export type RealtimeSource = "api" | "chat";
export type RealtimeTerminalStatus = "completed" | "failed" | "cancelled" | "expired";

export function realtimeMaxDurationSeconds(provider: RealtimeProvider): number {
	return provider === "google-ai-studio"
		? GOOGLE_REALTIME_MAX_DURATION_SECONDS
		: REALTIME_MAX_DURATION_SECONDS;
}

export type RealtimeAuthContext = {
	requestId: string;
	workspaceId: string;
	apiKeyId: string;
	userId?: string | null;
	internal?: boolean;
};

export type RealtimeSessionRow = {
	id: string;
	session_id: string;
	workspace_id: string;
	key_id: string | null;
	user_id: string | null;
	source: RealtimeSource;
	provider: string;
	model_id: string;
	provider_model_id: string | null;
	voice: string | null;
	status: string;
	started_at: string;
	connected_at: string | null;
	ended_at: string | null;
	expires_at: string | null;
	reservation_prefix: string;
	reservation_count: number;
	reserved_nanos: number;
	captured_nanos: number;
	released_nanos: number;
	estimated_cost_nanos: number;
	final_cost_nanos: number | null;
	currency: string;
	usage: Record<string, unknown>;
	pricing_lines: unknown[];
	provider_session_id?: string | null;
	provider_native_id?: string | null;
	provider_client_secret_hash?: string | null;
	error_code?: string | null;
	error_message?: string | null;
	disconnect_reason?: string | null;
	metadata?: Record<string, unknown> | null;
	last_event_at?: string | null;
	updated_at?: string | null;
};

type ProviderSession = {
	clientSecret: string;
	expiresAt: string | null;
	connect: {
		transport: "webrtc" | "websocket";
		url: string;
	};
	raw: unknown;
	providerSessionId?: string | null;
};

type WalletSettlementResult = {
	applied: boolean;
	already_applied: boolean;
	status: string;
	final_cost_nanos: number;
	reserved_nanos: number;
	captured_nanos: number;
	released_nanos: number;
	before_balance_nanos: number | null;
	after_balance_nanos: number | null;
	before_reserved_nanos: number | null;
	after_reserved_nanos: number | null;
};

function normalizeText(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function toFiniteNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim()) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

function toNanos(value: unknown): number {
	const parsed = toFiniteNumber(value);
	return parsed == null ? 0 : Math.max(0, Math.round(parsed));
}

function firstFiniteNumberAtPath(source: any, paths: string[]): number | null {
	for (const path of paths) {
		const value = getNumberAtPath(source, path);
		if (value != null) return value;
	}
	return null;
}

function secondsFromDuration(source: any, kind: "input" | "output" | "total"): number | null {
	const prefixes =
		kind === "input"
			? ["input_audio"]
			: kind === "output"
				? ["output_audio"]
				: ["audio", "total_audio"];
	const seconds = firstFiniteNumberAtPath(
		source,
		prefixes.flatMap((prefix) => [
			`${prefix}_seconds`,
			`${prefix}_duration_seconds`,
			`${prefix}.seconds`,
			`${prefix}.duration_seconds`,
		]),
	);
	if (seconds != null) return Math.max(0, seconds);
	const milliseconds = firstFiniteNumberAtPath(
		source,
		prefixes.flatMap((prefix) => [
			`${prefix}_ms`,
			`${prefix}_milliseconds`,
			`${prefix}_duration_ms`,
			`${prefix}.ms`,
			`${prefix}.milliseconds`,
			`${prefix}.duration_ms`,
		]),
	);
	if (milliseconds != null) return Math.max(0, milliseconds / 1000);
	const minutes = firstFiniteNumberAtPath(
		source,
		prefixes.flatMap((prefix) => [
			`${prefix}_minutes`,
			`${prefix}.minutes`,
			`${prefix}.duration_minutes`,
		]),
	);
	return minutes != null ? Math.max(0, minutes * 60) : null;
}

function providerFromModel(model: string, explicitProvider?: string | null): RealtimeProvider | null {
	const provider = String(explicitProvider ?? "").trim().toLowerCase();
	if (provider === "openai") return "openai";
	if (provider === "xai" || provider === "x-ai" || provider === "spacex-ai") return "x-ai";
	if (provider === "google" || provider === "google-ai-studio") return "google-ai-studio";
	const normalized = model.trim().toLowerCase();
	if (normalized.startsWith("openai/")) return "openai";
	if (normalized.startsWith("x-ai/") || normalized.startsWith("xai/")) return "x-ai";
	if (normalized.startsWith("google/")) return "google-ai-studio";
	return null;
}

function canonicalModel(provider: RealtimeProvider, model: string): string {
	const trimmed = model.trim();
	if (!trimmed.includes("/")) {
		if (provider === "openai") return `openai/${trimmed}`;
		if (provider === "x-ai") return `x-ai/${trimmed}`;
		return `google/${trimmed}`;
	}
	if (provider === "x-ai" && trimmed.startsWith("xai/")) return `x-ai/${trimmed.slice(4)}`;
	return trimmed;
}

function providerModel(provider: RealtimeProvider, model: string): string {
	const canonical = canonicalModel(provider, model);
	if (provider === "openai") return canonical.replace(/^openai\//, "");
	if (provider === "x-ai") return canonical.replace(/^x-ai\//, "");
	return canonical.replace(/^google\//, "");
}

function defaultVoice(provider: RealtimeProvider, requested?: string | null): string {
	const trimmed = normalizeText(requested);
	if (trimmed) return trimmed;
	if (provider === "openai") return "marin";
	if (provider === "google-ai-studio") return "Puck";
	return "eve";
}

function parseProviderJson(rawText: string): unknown {
	if (!rawText.trim()) return {};
	try {
		return JSON.parse(rawText);
	} catch {
		return { raw_text: rawText };
	}
}

function extractProviderError(payload: unknown, fallback: string): string {
	if (!payload || typeof payload !== "object") return fallback;
	const record = payload as Record<string, unknown>;
	const error = record.error;
	if (error && typeof error === "object") {
		const message = (error as Record<string, unknown>).message;
		if (typeof message === "string" && message.trim()) return message;
	}
	if (typeof record.message === "string" && record.message.trim()) return record.message;
	return fallback;
}

function providerHttpError(provider: string, response: Response, raw: unknown, rawText: string, fallback: string): string {
	const extracted = extractProviderError(raw, rawText.trim());
	const detail = extracted.trim() || fallback;
	return `${provider}_http_${response.status}: ${detail}`;
}

function extractClientSecret(payload: unknown): string | null {
	if (!payload || typeof payload !== "object") return null;
	const record = payload as Record<string, unknown>;
	for (const candidate of [
		record.value,
		record.name,
		record.secret,
		record.token,
		record.client_secret,
		record.clientSecret,
	]) {
		if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
		if (candidate && typeof candidate === "object") {
			const nested = candidate as Record<string, unknown>;
			for (const key of ["value", "secret", "token"]) {
				if (typeof nested[key] === "string" && nested[key].trim()) {
					return nested[key].trim();
				}
			}
		}
	}
	return null;
}

function extractExpiresAt(payload: unknown): string | null {
	if (!payload || typeof payload !== "object") return null;
	const record = payload as Record<string, unknown>;
	const nested =
		record.client_secret && typeof record.client_secret === "object"
			? (record.client_secret as Record<string, unknown>)
			: null;
	const value =
		record.expires_at ??
		record.expiresAt ??
		record.expire_at ??
		nested?.expires_at ??
		nested?.expiresAt;
	if (typeof value === "string" && value.trim()) return value.trim();
	if (typeof value === "number" && Number.isFinite(value)) {
		return new Date(value * 1000).toISOString();
	}
	return null;
}

export function buildGoogleBidiGenerateContentSetup(args?: {
	model?: string | null;
	voice?: string | null;
	instructions?: string | null;
}) {
	const voice = normalizeText(args?.voice) ?? "Puck";
	const model = normalizeText(args?.model) ?? "gemini-3.1-flash-live-preview";
	return {
		model: `models/${model}`,
		generationConfig: {
			responseModalities: ["AUDIO"],
			temperature: 0.7,
			speechConfig: {
				voiceConfig: {
					prebuiltVoiceConfig: {
						voiceName: voice,
					},
				},
			},
		},
		...(args?.instructions
			? {
					systemInstruction: {
						parts: [{ text: args.instructions }],
					},
				}
			: {}),
		inputAudioTranscription: {},
		outputAudioTranscription: {},
		contextWindowCompression: {
			slidingWindow: {},
		},
		realtimeInputConfig: {
			automaticActivityDetection: {
				disabled: false,
				silenceDurationMs: 1100,
				prefixPaddingMs: 300,
			},
			activityHandling: "START_OF_ACTIVITY_INTERRUPTS",
			turnCoverage: "TURN_INCLUDES_ONLY_ACTIVITY",
		},
	};
}

export function buildGoogleRealtimeAuthTokenRequest(
	now = Date.now(),
	args?: {
		model?: string | null;
		voice?: string | null;
		instructions?: string | null;
	},
) {
	const model = normalizeText(args?.model);
	return {
		url: GOOGLE_AUTH_TOKENS_URL,
		body: {
			uses: 1,
			expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
			newSessionExpireTime: new Date(now + 60 * 1000).toISOString(),
			...(model
				? {
						bidiGenerateContentSetup: buildGoogleBidiGenerateContentSetup(args),
					}
				: {}),
		},
	};
}

export async function sha256Hex(value: string): Promise<string> {
	const bytes = new TextEncoder().encode(value);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

export function pcm16Base64DurationMs(base64: string, sampleRate: number): number {
	const normalized = base64.trim();
	if (!normalized || sampleRate <= 0) return 0;
	const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
	const byteLength = Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
	const samples = Math.floor(byteLength / 2);
	return Math.round((samples / sampleRate) * 1000);
}

export function resolveRealtimeFinalCostNanos(args: {
	auth: Pick<RealtimeAuthContext, "internal">;
	finalCostNanos?: number | null;
	pricedCostNanos: number;
}): number {
	if (args.auth.internal === true && args.finalCostNanos != null) {
		return Math.max(0, Math.round(args.finalCostNanos));
	}
	return Math.max(0, Math.round(args.pricedCostNanos));
}

export function assertRealtimeSettlementAuthority(auth: Pick<RealtimeAuthContext, "internal">) {
	if (auth.internal !== true) throw new Error("realtime_settlement_internal_only");
}

export function decideRealtimeRelayBudget(args: {
	reservedNanos: number;
	estimatedCostNanos: number;
}): {
	action: "none" | "extend";
	ratio: number;
	targetReservedNanos?: number;
} {
	const reservedNanos = Math.max(0, Math.round(args.reservedNanos));
	const estimatedCostNanos = Math.max(0, Math.round(args.estimatedCostNanos));
	if (reservedNanos <= 0) return { action: "none", ratio: 0 };
	const ratio = estimatedCostNanos / reservedNanos;
	if (ratio >= REALTIME_EXTEND_THRESHOLD) {
		return {
			action: "extend",
			ratio,
			targetReservedNanos: reservedNanos + REALTIME_HOLD_INCREMENT_NANOS,
		};
	}
	return { action: "none", ratio };
}

export function resolveOpenAIKey(): string {
	const bindings = getBindings() as Record<string, unknown>;
	return String(bindings.OPENAI_API_KEY ?? "").trim();
}

export function resolveXAIKey(): string {
	const bindings = getBindings() as Record<string, unknown>;
	return String(bindings.X_AI_API_KEY ?? "").trim();
}

export function resolveGoogleKey(): string {
	const bindings = getBindings() as Record<string, unknown>;
	return String(bindings.GOOGLE_AI_STUDIO_API_KEY ?? "").trim();
}

async function createOpenAIProviderSession(args: {
	model: string;
	voice: string;
	instructions?: string | null;
	userId?: string | null;
}): Promise<ProviderSession> {
	const apiKey = resolveOpenAIKey();
	if (!apiKey) throw new Error("openai_key_missing");
	const response = await fetch(`${OPENAI_REALTIME_URL}/client_secrets`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
			...(args.userId ? { "OpenAI-Safety-Identifier": await sha256Hex(`realtime:${args.userId}`) } : {}),
		},
		body: JSON.stringify({
			session: {
				type: "realtime",
				model: args.model,
				...(args.instructions ? { instructions: args.instructions } : {}),
				output_modalities: ["audio"],
				audio: {
					input: {
						format: { type: "audio/pcm", rate: 24000 },
						turn_detection: { type: "server_vad" },
					},
					output: {
						format: { type: "audio/pcm", rate: 24000 },
						voice: args.voice,
					},
				},
			},
		}),
	});
	const rawText = await response.text();
	const raw = parseProviderJson(rawText);
	if (!response.ok) {
		throw new Error(extractProviderError(raw, rawText || "openai_realtime_session_failed"));
	}
	const clientSecret = extractClientSecret(raw);
	if (!clientSecret) throw new Error("openai_client_secret_missing");
	return {
		clientSecret,
		expiresAt: extractExpiresAt(raw),
		connect: { transport: "webrtc", url: OPENAI_REALTIME_CALLS_URL },
		raw,
		providerSessionId: normalizeText((raw as Record<string, unknown>)?.id),
	};
}

async function createXAIProviderSession(args: { model: string }): Promise<ProviderSession> {
	const apiKey = resolveXAIKey();
	if (!apiKey) throw new Error("xai_key_missing");
	const response = await fetch("https://api.x.ai/v1/realtime/client_secrets", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ expires_after: { seconds: 600 } }),
	});
	const rawText = await response.text();
	const raw = parseProviderJson(rawText);
	if (!response.ok) {
		throw new Error(extractProviderError(raw, rawText || "xai_realtime_session_failed"));
	}
	const clientSecret = extractClientSecret(raw);
	if (!clientSecret) throw new Error("xai_client_secret_missing");
	return {
		clientSecret,
		expiresAt: extractExpiresAt(raw),
		connect: { transport: "websocket", url: `${XAI_REALTIME_URL}?model=${encodeURIComponent(args.model)}` },
		raw,
		providerSessionId: normalizeText((raw as Record<string, unknown>)?.id),
	};
}

async function createGoogleProviderSession(args: {
	model: string;
	voice: string;
	instructions?: string | null;
}): Promise<ProviderSession> {
	const apiKey = resolveGoogleKey();
	if (!apiKey) throw new Error("google_key_missing");
	const request = buildGoogleRealtimeAuthTokenRequest(Date.now(), args);
	const response = await fetch(`${request.url}?key=${encodeURIComponent(apiKey)}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(request.body),
	});
	const rawText = await response.text();
	const raw = parseProviderJson(rawText);
	if (!response.ok) {
		throw new Error(providerHttpError("google_realtime_session", response, raw, rawText, "google_realtime_session_failed"));
	}
	const clientSecret = extractClientSecret(raw);
	if (!clientSecret) throw new Error("google_client_secret_missing");
	return {
		clientSecret,
		expiresAt: extractExpiresAt(raw) ?? request.body.expireTime,
		connect: {
			transport: "websocket",
			url: `${GOOGLE_LIVE_CONSTRAINED_URL}?access_token=${encodeURIComponent(clientSecret)}`,
		},
		raw,
		providerSessionId: normalizeText((raw as Record<string, unknown>)?.name),
	};
}

function getNumberAtPath(source: any, path: string): number | null {
	const value = path.split(".").reduce((current, key) => current?.[key], source);
	return toFiniteNumber(value);
}

function modalityTokens(details: unknown, modality: string): number {
	if (!Array.isArray(details)) return 0;
	return details.reduce((sum, item) => {
		if (!item || typeof item !== "object") return sum;
		const record = item as Record<string, unknown>;
		const itemModality = String(record.modality ?? record.type ?? "").trim().toLowerCase();
		if (itemModality !== modality) return sum;
		return sum + (toFiniteNumber(record.tokenCount ?? record.token_count) ?? 0);
	}, 0);
}

export function normalizeRealtimeUsage(rawUsage: Record<string, unknown>): Record<string, unknown> {
	const source = rawUsage && typeof rawUsage === "object" ? rawUsage as any : {};
	const usageMetadata = source.usageMetadata && typeof source.usageMetadata === "object"
		? source.usageMetadata as any
		: source;
	const googlePromptDetails = usageMetadata.promptTokensDetails ?? usageMetadata.prompt_tokens_details;
	const googleResponseDetails = usageMetadata.responseTokensDetails ?? usageMetadata.response_tokens_details;
	const googleInputText = modalityTokens(googlePromptDetails, "text");
	const googleInputAudio = modalityTokens(googlePromptDetails, "audio");
	const googleOutputText = modalityTokens(googleResponseDetails, "text");
	const googleOutputAudio = modalityTokens(googleResponseDetails, "audio");

	const inputText =
		toFiniteNumber(source.input_text_tokens) ??
		getNumberAtPath(source, "input_token_details.text_tokens") ??
		getNumberAtPath(source, "input_tokens_details.text_tokens") ??
		(googleInputText > 0 ? googleInputText : null);
	const inputAudio =
		toFiniteNumber(source.input_audio_tokens) ??
		getNumberAtPath(source, "input_token_details.audio_tokens") ??
		getNumberAtPath(source, "input_tokens_details.audio_tokens") ??
		getNumberAtPath(source, "input_tokens_details.input_audio") ??
		(googleInputAudio > 0 ? googleInputAudio : null);
	const outputText =
		toFiniteNumber(source.output_text_tokens) ??
		getNumberAtPath(source, "output_token_details.text_tokens") ??
		getNumberAtPath(source, "output_tokens_details.text_tokens") ??
		(googleOutputText > 0 ? googleOutputText : null);
	const outputAudio =
		toFiniteNumber(source.output_audio_tokens) ??
		getNumberAtPath(source, "output_token_details.audio_tokens") ??
		getNumberAtPath(source, "output_tokens_details.audio_tokens") ??
		getNumberAtPath(source, "output_tokens_details.output_audio") ??
		(googleOutputAudio > 0 ? googleOutputAudio : null);
	const cachedText =
		toFiniteNumber(source.cached_read_text_tokens) ??
		getNumberAtPath(source, "input_token_details.cached_tokens_details.text_tokens") ??
		getNumberAtPath(source, "input_tokens_details.cached_tokens_details.text_tokens") ??
		getNumberAtPath(source, "input_tokens_details.cached_tokens");
	const cachedAudio =
		toFiniteNumber(source.cached_read_audio_tokens) ??
		getNumberAtPath(source, "input_token_details.cached_tokens_details.audio_tokens") ??
		getNumberAtPath(source, "input_tokens_details.cached_tokens_details.audio_tokens");
	const inputAudioSeconds = secondsFromDuration(source, "input");
	const outputAudioSeconds = secondsFromDuration(source, "output");
	const explicitAudioSeconds = secondsFromDuration(source, "total");
	const totalAudioSeconds =
		explicitAudioSeconds ??
		(inputAudioSeconds != null || outputAudioSeconds != null
			? (inputAudioSeconds ?? 0) + (outputAudioSeconds ?? 0)
			: null);
	const textMessages =
		toFiniteNumber(source.input_text_messages) ??
		toFiniteNumber(source.realtime_text_messages) ??
		getNumberAtPath(source, "text_messages.input") ??
		getNumberAtPath(source, "messages.text_input");

	return {
		...source,
		...(inputText != null ? { input_text_tokens: Math.max(0, inputText - (cachedText ?? 0)) } : {}),
		...(inputAudio != null
			? { input_audio_tokens: Math.max(0, inputAudio - (cachedAudio ?? 0)) }
			: {}),
		...(outputText != null ? { output_text_tokens: outputText } : {}),
		...(outputAudio != null
			? { output_audio_tokens: outputAudio }
			: {}),
		...(cachedText != null ? { cached_read_text_tokens: cachedText } : {}),
		...(cachedAudio != null ? { cached_read_audio_tokens: cachedAudio } : {}),
		...(inputAudioSeconds != null ? {
			input_audio_seconds: inputAudioSeconds,
			input_audio_minutes: inputAudioSeconds / 60,
		} : {}),
		...(outputAudioSeconds != null ? {
			output_audio_seconds: outputAudioSeconds,
			output_audio_minutes: outputAudioSeconds / 60,
		} : {}),
		...(totalAudioSeconds != null ? {
			audio_seconds: totalAudioSeconds,
			audio_minutes: totalAudioSeconds / 60,
		} : {}),
		...(textMessages != null ? { input_text_messages: textMessages } : {}),
	};
}

function pricingLines(pricedUsage: Record<string, unknown>): unknown[] {
	const pricing = pricedUsage.pricing && typeof pricedUsage.pricing === "object"
		? pricedUsage.pricing as Record<string, unknown>
		: null;
	return Array.isArray(pricing?.lines) ? pricing.lines : [];
}

function pricedTotalNanos(pricedUsage: Record<string, unknown>): number {
	const pricing = pricedUsage.pricing && typeof pricedUsage.pricing === "object"
		? pricedUsage.pricing as Record<string, unknown>
		: null;
	return toNanos(pricing?.total_nanos ?? pricedUsage.total_nanos);
}

export function assertRealtimeBillingMetersPresent(args: {
	provider: RealtimeProvider;
	usage: Record<string, unknown>;
	costNanos: number;
}) {
	if (args.provider === "x-ai") return;
	const responseInFlight = args.usage.assistant_response_in_flight === true;
	if (responseInFlight) {
		throw new Error(`${args.provider}_realtime_authoritative_usage_pending`);
	}
	const audioSeconds =
		(toFiniteNumber(args.usage.input_audio_seconds) ?? 0) +
		(toFiniteNumber(args.usage.output_audio_seconds) ?? 0) +
		(toFiniteNumber(args.usage.audio_seconds) ?? 0);
	if (audioSeconds <= 0 && args.costNanos <= 0) return;
	const tokenMeters =
		(toFiniteNumber(args.usage.input_text_tokens) ?? 0) +
		(toFiniteNumber(args.usage.input_audio_tokens) ?? 0) +
		(toFiniteNumber(args.usage.output_text_tokens) ?? 0) +
		(toFiniteNumber(args.usage.output_audio_tokens) ?? 0) +
		(toFiniteNumber(args.usage.cached_read_text_tokens) ?? 0) +
		(toFiniteNumber(args.usage.cached_read_audio_tokens) ?? 0);
	if (tokenMeters > 0) return;
	throw new Error(`${args.provider}_realtime_usage_missing_token_meters`);
}

async function requireRealtimePriceCard(provider: RealtimeProvider, modelId: string) {
	const card = await loadPriceCard(provider, modelId, "audio.realtime");
	if (!card || !Array.isArray(card.rules) || card.rules.length === 0) {
		throw new Error("realtime_price_card_missing");
	}
	return card;
}

async function evaluateActiveRealtimePolicy(
	session: RealtimeSessionRow,
	estimatedCostNanos: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
	const context = await fetchGatewayContext({
		workspaceId: session.workspace_id,
		apiKeyId: session.key_id ?? "00000000-0000-0000-0000-000000000000",
		model: session.model_id,
		endpoint: "audio.realtime",
	});
	if (!context.key.ok) return { ok: false, reason: "realtime_key_invalid" };
	if (!context.keyLimit.ok && context.keyLimit.limitMetric !== "requests") {
		return { ok: false, reason: "realtime_key_limit_exceeded" };
	}
	const provider = providerFromModel(session.model_id, session.provider);
	const { candidates } = buildProviderCandidatesWithDiagnostics(context);
	const workspacePolicy = await fetchWorkspacePolicy({
		workspaceId: session.workspace_id,
		apiKeyId: session.key_id ?? "00000000-0000-0000-0000-000000000000",
	});
	const policyResult = applyWorkspacePolicy({
		providers: candidates,
		resolvedModel: context.resolvedModel || session.model_id,
		body: { model: context.resolvedModel || session.model_id, provider },
		workspacePolicy,
		teamSettings: context.teamSettings ?? null,
	});
	if (!policyResult.ok) {
		return { ok: false, reason: "realtime_workspace_policy_blocked" };
	}
	if (!provider || !policyResult.providers.some((candidate) => candidate.providerId === provider)) {
		return { ok: false, reason: "realtime_provider_not_available" };
	}
	for (const bucket of Object.values(context.keyLimit.buckets ?? {})) {
		if (!bucket || bucket.costLimitNanos <= 0) continue;
		if (bucket.costUsedNanos + Math.max(0, estimatedCostNanos) >= bucket.costLimitNanos) {
			return { ok: false, reason: "realtime_key_cost_limit_reached" };
		}
	}
	return { ok: true };
}

export async function createRealtimeSession(args: {
	auth: RealtimeAuthContext;
	model: string;
	provider?: string | null;
	voice?: string | null;
	instructions?: string | null;
	source?: RealtimeSource;
	metadata?: Record<string, unknown>;
	relay?: boolean;
}): Promise<{
	session: RealtimeSessionRow;
	clientSecret: string;
	connect: ProviderSession["connect"];
	raw: unknown;
}> {
	const provider = providerFromModel(args.model, args.provider);
	if (!provider) throw new Error("realtime_provider_required");
	const modelId = canonicalModel(provider, args.model);
	const providerModelId = providerModel(provider, args.model);
	const voice = defaultVoice(provider, args.voice);
	const card = await requireRealtimePriceCard(provider, modelId);
	void card;

	const supabase = getSupabaseAdmin();
	const sessionId = `rt_${ulid().toLowerCase()}`;
	const reservationPrefix = `rt:${sessionId}:`;
	const expiresAt = new Date(Date.now() + realtimeMaxDurationSeconds(provider) * 1000).toISOString();

	const useRelay = args.relay !== false || !args.auth.internal;
	const relaySecret = useRelay ? `rtsec_${ulid().toLowerCase()}${ulid().toLowerCase()}` : null;
	const secretHash = relaySecret ? await sha256Hex(relaySecret) : null;
	const sessionMetadata = {
		...(args.metadata ?? {}),
		...(useRelay ? { relay: true, instructions: args.instructions ?? null } : {}),
	};
	const createRpc = await supabase.rpc("gateway_realtime_create_with_hold", {
		p_workspace_id: args.auth.workspaceId,
		p_session_id: sessionId,
		p_key_id: args.auth.apiKeyId,
		p_user_id: args.auth.userId ?? null,
		p_source: args.source ?? "api",
		p_provider: provider,
		p_model_id: modelId,
		p_provider_model_id: providerModelId,
		p_voice: voice,
		p_expires_at: expiresAt,
		p_reservation_prefix: reservationPrefix,
		p_reservation_id: `${reservationPrefix}0001`,
		p_hold_nanos: REALTIME_INITIAL_HOLD_NANOS,
		p_client_secret_hash: secretHash,
		p_metadata: sessionMetadata,
		p_max_workspace_sessions: REALTIME_MAX_WORKSPACE_SESSIONS,
		p_max_key_sessions: REALTIME_MAX_KEY_SESSIONS,
		p_max_user_sessions: REALTIME_MAX_USER_SESSIONS,
		p_max_creations_per_minute: REALTIME_MAX_CREATIONS_PER_MINUTE,
	});
	if (createRpc.error) throw createRpc.error;
	const created = (Array.isArray(createRpc.data) ? createRpc.data[0] : createRpc.data) as RealtimeSessionRow | null;
	if (!created) throw new Error("realtime_session_create_empty");
	if (useRelay) {
		return {
			session: created,
			clientSecret: relaySecret!,
			connect: {
				transport: "websocket",
				url: `/v1/realtime/sessions/${encodeURIComponent(sessionId)}/relay`,
			},
			raw: { relay: true },
		};
	}

	try {
		const providerSession =
			provider === "openai"
				? await createOpenAIProviderSession({
						model: providerModelId,
						voice,
						instructions: args.instructions,
						userId: args.auth.userId,
					})
				: provider === "google-ai-studio"
					? await createGoogleProviderSession({
							model: providerModelId,
							voice,
							instructions: args.instructions,
						})
					: await createXAIProviderSession({ model: providerModelId });
		const secretHash = await sha256Hex(providerSession.clientSecret);
		const { data: updated, error: updateError } = await supabase
			.from("gateway_realtime_sessions")
			.update({
				provider_client_secret_hash: secretHash,
				provider_session_id: providerSession.providerSessionId ?? null,
				expires_at: providerSession.expiresAt ?? expiresAt,
				updated_at: new Date().toISOString(),
			})
			.eq("workspace_id", args.auth.workspaceId)
			.eq("session_id", sessionId)
			.select("*")
			.single();
		if (updateError || !updated) throw updateError ?? new Error("realtime_session_update_failed");
		return {
			session: updated as RealtimeSessionRow,
			clientSecret: providerSession.clientSecret,
			connect: providerSession.connect,
			raw: providerSession.raw,
		};
	} catch (error) {
		await settleRealtimeSession({
			auth: args.auth,
			sessionId,
			status: "failed",
			usage: {},
			finalCostNanos: 0,
			errorCode: "provider_session_failed",
			errorMessage: error instanceof Error ? error.message : "Provider realtime session creation failed.",
		}).catch(() => undefined);
		throw error;
	}
}

export async function claimRealtimeSessionForRelay(args: {
	sessionId: string;
	token: string;
}): Promise<RealtimeSessionRow> {
	const supabase = getSupabaseAdmin();
	const rpc = await supabase.rpc("gateway_realtime_claim_connection", {
		p_session_id: args.sessionId,
		p_client_secret_hash: await sha256Hex(args.token),
	});
	if (rpc.error) throw rpc.error;
	const session = (Array.isArray(rpc.data) ? rpc.data[0] : rpc.data) as RealtimeSessionRow | null;
	if (!session) throw new Error("realtime_relay_claim_empty");
	return session;
}

export async function getRealtimeSessionForInternal(sessionId: string): Promise<RealtimeSessionRow> {
	const { data, error } = await getSupabaseAdmin()
		.from("gateway_realtime_sessions")
		.select("*")
		.eq("session_id", sessionId)
		.maybeSingle();
	if (error) throw error;
	if (!data) throw new Error("realtime_session_not_found");
	return data as RealtimeSessionRow;
}

export async function extendRealtimeSessionHold(args: {
	auth: RealtimeAuthContext;
	sessionId: string;
	targetReservedNanos?: number | null;
	estimatedCostNanos?: number | null;
}): Promise<RealtimeSessionRow> {
	const supabase = getSupabaseAdmin();
	const { data: row, error } = await supabase
		.from("gateway_realtime_sessions")
		.select("*")
		.eq("workspace_id", args.auth.workspaceId)
		.eq("session_id", args.sessionId)
		.maybeSingle();
	if (error) throw error;
	if (!row) throw new Error("realtime_session_not_found");
	const session = row as RealtimeSessionRow;
	if (session.key_id && session.key_id !== args.auth.apiKeyId && !args.auth.internal) {
		throw new Error("realtime_session_forbidden");
	}
	if (["completed", "failed", "cancelled", "expired"].includes(session.status)) {
		throw new Error("realtime_session_terminal");
	}
	const currentReserved = Math.max(0, Number(session.reserved_nanos ?? 0) || 0);
	const requestedTarget = Math.max(0, Math.round(args.targetReservedNanos ?? 0));
	const targetReserved = Math.max(currentReserved + REALTIME_HOLD_INCREMENT_NANOS, requestedTarget);
	const additionalNanos = Math.max(0, targetReserved - currentReserved);
	const estimatedCostNanos = Math.max(
		Math.max(0, Number(session.estimated_cost_nanos ?? 0) || 0),
		Math.max(0, Math.round(args.estimatedCostNanos ?? 0)),
	);
	const policy = await evaluateActiveRealtimePolicy(session, estimatedCostNanos);
	if ("reason" in policy) throw new Error(policy.reason);
	const rpc = await supabase.rpc("gateway_realtime_extend_hold_once", {
		p_workspace_id: args.auth.workspaceId,
		p_session_id: args.sessionId,
		p_reservation_id: `${session.reservation_prefix}${ulid().toLowerCase()}`,
		p_target_reserved_nanos: targetReserved,
		p_estimated_cost_nanos: estimatedCostNanos,
	});
	if (rpc.error) throw rpc.error;
	const updated = (Array.isArray(rpc.data) ? rpc.data[0] : rpc.data) as RealtimeSessionRow | null;
	if (!updated) throw new Error(additionalNanos > 0 ? "realtime_session_extend_empty" : "realtime_session_estimate_update_failed");
	return updated;
}

export async function markRealtimeSessionConnected(args: {
	auth: RealtimeAuthContext;
	sessionId: string;
}): Promise<RealtimeSessionRow> {
	const now = new Date().toISOString();
	const { data, error } = await getSupabaseAdmin()
		.from("gateway_realtime_sessions")
		.update({
			status: "connected",
			connected_at: now,
			last_event_at: now,
			updated_at: now,
		})
		.eq("workspace_id", args.auth.workspaceId)
		.eq("session_id", args.sessionId)
		.eq("status", "connecting")
		.eq("key_id", args.auth.apiKeyId)
		.select("*")
		.maybeSingle();
	if (error) throw error;
	if (!data) throw new Error("realtime_session_mark_connected_conflict");
	return data as RealtimeSessionRow;
}

export async function updateRealtimeSessionUsage(args: {
	auth: RealtimeAuthContext;
	sessionId: string;
	usage?: Record<string, unknown>;
	estimatedCostNanos?: number | null;
}): Promise<RealtimeSessionRow> {
	const supabase = getSupabaseAdmin();
	const { data: row, error } = await supabase
		.from("gateway_realtime_sessions")
		.select("*")
		.eq("workspace_id", args.auth.workspaceId)
		.eq("session_id", args.sessionId)
		.maybeSingle();
	if (error) throw error;
	if (!row) throw new Error("realtime_session_not_found");
	const session = row as RealtimeSessionRow;
	if (session.key_id && session.key_id !== args.auth.apiKeyId && !args.auth.internal) {
		throw new Error("realtime_session_forbidden");
	}
	if (["completed", "failed", "cancelled", "expired"].includes(session.status)) {
		return session;
	}
	const provider = providerFromModel(session.model_id, session.provider);
	if (!provider) throw new Error("realtime_provider_required");
	const card = await requireRealtimePriceCard(provider, session.model_id);
	const normalizedUsage = normalizeRealtimeUsage(args.usage ?? session.usage ?? {});
	const pricedUsage = computeBill(normalizedUsage, card, { endpoint: "audio.realtime" });
	const pricedNanos = pricedTotalNanos(pricedUsage);
	const estimatedCostNanos = Math.max(
		Math.max(0, Number(session.estimated_cost_nanos ?? 0) || 0),
		Math.max(0, Math.round(args.estimatedCostNanos ?? 0)),
		pricedNanos,
	);
	const policy = await evaluateActiveRealtimePolicy(session, estimatedCostNanos);
	const { data: updated, error: updateError } = await supabase
		.from("gateway_realtime_sessions")
		.update({
			...("reason" in policy
				? {
						status: "ending",
						disconnect_reason: policy.reason,
						error_code: policy.reason,
					}
				: {}),
			usage: normalizedUsage,
			pricing_lines: pricingLines(pricedUsage),
			estimated_cost_nanos: estimatedCostNanos,
			last_event_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		})
		.eq("workspace_id", args.auth.workspaceId)
		.eq("session_id", args.sessionId)
		.in("status", ["connecting", "connected", "ending"])
		.select("*")
		.maybeSingle();
	if (updateError) throw updateError;
	if (!updated) {
		const { data: current, error: currentError } = await supabase
			.from("gateway_realtime_sessions")
			.select("*")
			.eq("workspace_id", args.auth.workspaceId)
			.eq("session_id", args.sessionId)
			.single();
		if (currentError || !current) {
			throw currentError ?? new Error("realtime_session_usage_update_failed");
		}
		return current as RealtimeSessionRow;
	}
	return updated as RealtimeSessionRow;
}

export async function markRealtimeSessionBillingUnresolved(args: {
	auth: RealtimeAuthContext;
	sessionId: string;
	usage: Record<string, unknown>;
	reason: string;
}): Promise<RealtimeSessionRow> {
	const rpc = await getSupabaseAdmin().rpc("gateway_realtime_mark_billing_unresolved", {
		p_workspace_id: args.auth.workspaceId,
		p_session_id: args.sessionId,
		p_usage: normalizeRealtimeUsage(args.usage),
		p_reason: args.reason,
	});
	if (rpc.error) throw rpc.error;
	const session = (Array.isArray(rpc.data) ? rpc.data[0] : rpc.data) as RealtimeSessionRow | null;
	if (!session) throw new Error("realtime_billing_unresolved_empty");
	return session;
}

export async function settleRealtimeSession(args: {
	auth: RealtimeAuthContext;
	sessionId: string;
	status?: RealtimeTerminalStatus;
	usage?: Record<string, unknown>;
	finalCostNanos?: number | null;
	disconnectReason?: string | null;
	errorCode?: string | null;
	errorMessage?: string | null;
}): Promise<{ session: RealtimeSessionRow; settlement: WalletSettlementResult; pricedUsage: Record<string, unknown> }> {
	const supabase = getSupabaseAdmin();
	const { data: row, error } = await supabase
		.from("gateway_realtime_sessions")
		.select("*")
		.eq("workspace_id", args.auth.workspaceId)
		.eq("session_id", args.sessionId)
		.maybeSingle();
	if (error) throw error;
	if (!row) throw new Error("realtime_session_not_found");
	const session = row as RealtimeSessionRow;
	if (session.key_id && session.key_id !== args.auth.apiKeyId && !args.auth.internal) {
		throw new Error("realtime_session_forbidden");
	}
	assertRealtimeSettlementAuthority(args.auth);
	if (["completed", "failed", "cancelled", "expired"].includes(session.status)) {
		await syncRealtimeGatewayRequestSummary(session);
		return {
			session,
			settlement: {
				applied: false,
				already_applied: true,
				status: session.status,
				final_cost_nanos: Math.max(0, Number(session.final_cost_nanos ?? 0) || 0),
				reserved_nanos: Math.max(0, Number(session.reserved_nanos ?? 0) || 0),
				captured_nanos: Math.max(0, Number(session.captured_nanos ?? 0) || 0),
				released_nanos: Math.max(0, Number(session.released_nanos ?? 0) || 0),
				before_balance_nanos: null,
				after_balance_nanos: null,
				before_reserved_nanos: null,
				after_reserved_nanos: null,
			},
			pricedUsage: {},
		};
	}
	const provider = providerFromModel(session.model_id, session.provider);
	if (!provider) throw new Error("realtime_provider_required");
	const card = await requireRealtimePriceCard(provider, session.model_id);
	const normalizedUsage = normalizeRealtimeUsage(args.usage ?? {});
	const pricedUsage = computeBill(normalizedUsage, card, { endpoint: "audio.realtime" });
	const costNanos = resolveRealtimeFinalCostNanos({
		auth: args.auth,
		finalCostNanos: args.finalCostNanos,
		pricedCostNanos: pricedTotalNanos(pricedUsage),
	});
	const lines = pricingLines(pricedUsage);
	assertRealtimeBillingMetersPresent({ provider, usage: normalizedUsage, costNanos });
	const rpc = await supabase.rpc("gateway_realtime_settle_once", {
		p_workspace_id: args.auth.workspaceId,
		p_session_id: args.sessionId,
		p_final_cost_nanos: costNanos,
		p_usage: normalizedUsage,
		p_pricing_lines: lines,
		p_status: args.status ?? "completed",
		p_disconnect_reason: args.disconnectReason ?? null,
		p_error_code: args.errorCode ?? null,
		p_error_message: args.errorMessage ?? null,
	});
	if (rpc.error) throw rpc.error;
	const settlement = (Array.isArray(rpc.data) ? rpc.data[0] : rpc.data) as WalletSettlementResult | null;
	if (!settlement) throw new Error("realtime_settlement_empty");
	if (settlement.status !== "completed" && settlement.status !== "failed" && settlement.status !== "cancelled" && settlement.status !== "expired") {
		throw new Error(`realtime_settlement_${settlement.status}`);
	}
	const { data: updated, error: readError } = await supabase
		.from("gateway_realtime_sessions")
		.select("*")
		.eq("workspace_id", args.auth.workspaceId)
		.eq("session_id", args.sessionId)
		.single();
	if (readError || !updated) throw readError ?? new Error("realtime_session_read_after_settle_failed");

	if (settlement.applied === true || settlement.already_applied === true) {
		await syncRealtimeGatewayRequestSummary(updated as RealtimeSessionRow);
	}

	return { session: updated as RealtimeSessionRow, settlement, pricedUsage };
}

async function syncRealtimeGatewayRequestSummary(session: RealtimeSessionRow) {
	const supabase = getSupabaseAdmin();
	const { data, error } = await supabase
		.from("gateway_requests")
		.select("id,created_at")
		.eq("realtime_session_id", session.session_id)
		.eq("created_at", session.started_at)
		.single();
	if (error || !data) throw error ?? new Error("realtime_gateway_request_summary_missing");
	await syncWorkspaceUsageRollupForRequest({
		requestRowId: data.id,
		requestCreatedAt: data.created_at,
		workspaceId: session.workspace_id,
		context: "realtime_session_finalization",
	});
}

export type RealtimeSessionReconciliationSummary = {
	startedAt: string;
	finishedAt: string;
	sessionsScanned: number;
	sessionsExpired: number;
	sessionsErrored: number;
	sessionsBillingUnresolved: number;
};

export async function realtimeReconciliationToken(): Promise<string> {
	const bindings = getBindings();
	const secret = normalizeText(bindings.GATEWAY_CONTROL_SECRET) ?? normalizeText(bindings.SUPABASE_SERVICE_ROLE_KEY);
	if (!secret) throw new Error("realtime_reconciliation_secret_missing");
	return sha256Hex(`phaseo:realtime-reconciliation:v1:${secret}`);
}

export async function runRealtimeSessionReconciliationJob(args?: {
	limit?: number;
	relay?: DurableObjectNamespace;
}): Promise<RealtimeSessionReconciliationSummary> {
	const startedAt = new Date().toISOString();
	const supabase = getSupabaseAdmin();
	const now = new Date().toISOString();
	const idleCutoff = new Date(Date.now() - REALTIME_IDLE_TIMEOUT_SECONDS * 1000).toISOString();
	const { data: sessions, error } = await supabase
		.from("gateway_realtime_sessions")
		.select("*")
		.in("status", ["created", "connecting", "connected", "ending"])
		.or(`expires_at.lte.${now},last_event_at.lte.${idleCutoff}`)
		.order("updated_at", { ascending: true })
		.limit(Math.max(1, Math.min(500, Math.trunc(args?.limit ?? 100))));
	if (error) throw error;

	let sessionsExpired = 0;
	let sessionsErrored = 0;
	for (const row of sessions ?? []) {
		const session = row as RealtimeSessionRow;
		try {
			if (args?.relay) {
				const stub = args.relay.get(args.relay.idFromName(session.session_id));
				const response = await stub.fetch(
					new Request(`https://realtime.internal/internal/reconcile/${encodeURIComponent(session.session_id)}`, {
						method: "POST",
						headers: { "x-realtime-reconcile-token": await realtimeReconciliationToken() },
					}),
				);
				if (!response.ok) throw new Error(`realtime_relay_reconciliation_http_${response.status}`);
				const result = await response.json<{ active?: boolean; settled?: boolean }>();
				if (result.active) {
					if (!result.settled) throw new Error("realtime_relay_reconciliation_pending");
					sessionsExpired += 1;
					continue;
				}
			}
			if (session.status !== "created") {
				const provider = providerFromModel(session.model_id, session.provider);
				if (provider !== "x-ai") {
					await markRealtimeSessionBillingUnresolved({
						auth: {
							requestId: `realtime_reconcile_unresolved:${session.session_id}`,
							workspaceId: session.workspace_id,
							apiKeyId: session.key_id ?? "00000000-0000-0000-0000-000000000000",
							userId: session.user_id ?? null,
							internal: true,
						},
						sessionId: session.session_id,
						usage: session.usage ?? {},
						reason: "realtime_relay_state_missing_during_reconciliation",
					});
					sessionsErrored += 1;
					continue;
				}
			}
			await settleRealtimeSession({
				auth: {
					requestId: `realtime_reconcile:${session.session_id}`,
					workspaceId: session.workspace_id,
					apiKeyId: session.key_id ?? "00000000-0000-0000-0000-000000000000",
					userId: session.user_id ?? null,
					internal: true,
				},
				sessionId: session.session_id,
				status: "expired",
				usage: session.usage ?? {},
				disconnectReason: "realtime_session_reconciliation_expired",
			});
			sessionsExpired += 1;
		} catch (settleError) {
			sessionsErrored += 1;
			console.error("realtime_session_reconciliation_failed", {
				error: settleError,
				workspaceId: session.workspace_id,
				sessionId: session.session_id,
			});
		}
	}

	const unresolvedCutoff = new Date(Date.now() - 60_000).toISOString();
	const { count: unresolvedCount, error: unresolvedError } = await supabase
		.from("gateway_realtime_sessions")
		.select("id", { count: "exact", head: true })
		.eq("status", "billing_unresolved")
		.lte("updated_at", unresolvedCutoff);
	if (unresolvedError) throw unresolvedError;

	return {
		startedAt,
		finishedAt: new Date().toISOString(),
		sessionsScanned: sessions?.length ?? 0,
		sessionsExpired,
		sessionsErrored,
		sessionsBillingUnresolved: unresolvedCount ?? 0,
	};
}

export function publicRealtimeSessionPayload(args: {
	session: RealtimeSessionRow;
	clientSecret?: string;
	connect?: ProviderSession["connect"];
	raw?: unknown;
}) {
	const reservedNanos = Math.max(0, Number(args.session.reserved_nanos ?? 0) || 0);
	const estimatedNanos = Math.max(0, Number(args.session.estimated_cost_nanos ?? 0) || 0);
	const startedAt = Date.parse(args.session.started_at);
	const expiresAt = Date.parse(args.session.expires_at ?? "");
	const maxDurationSeconds = Number.isFinite(startedAt) && Number.isFinite(expiresAt)
		? Math.max(0, Math.round((expiresAt - startedAt) / 1000))
		: realtimeMaxDurationSeconds(
			providerFromModel(args.session.model_id, args.session.provider) ?? "openai",
		);
	return {
		id: args.session.session_id,
		session_id: args.session.session_id,
		provider: args.session.provider,
		model: args.session.provider_model_id ?? providerModel(providerFromModel(args.session.model_id, args.session.provider) ?? "openai", args.session.model_id),
		model_id: args.session.model_id,
		voice: args.session.voice,
		status: args.session.status,
		expiresAt: args.session.expires_at,
		expires_at: args.session.expires_at,
		...(args.clientSecret ? { clientSecret: args.clientSecret, client_secret: args.clientSecret } : {}),
		...(args.connect ? { connect: args.connect } : {}),
		billing: {
			reservationNanos: reservedNanos,
			reservationUsd: reservedNanos / 1_000_000_000,
			reserved_nanos: reservedNanos,
			estimated_cost_nanos: estimatedNanos,
			remaining_nanos: Math.max(0, reservedNanos - estimatedNanos),
			extendThreshold: REALTIME_EXTEND_THRESHOLD,
			gracefulStopThreshold: REALTIME_GRACEFUL_STOP_THRESHOLD,
			maxDurationSeconds,
			idleTimeoutSeconds: REALTIME_IDLE_TIMEOUT_SECONDS,
			authoritative: true,
		},
		...(args.raw !== undefined ? { raw: args.raw } : {}),
	};
}
