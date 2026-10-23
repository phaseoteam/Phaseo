// Purpose: Durable realtime voice session billing helpers.
// Why: Realtime audio needs wallet holds that can extend before final settlement.
// How: Creates session rows, reserves $5 increments, prices final usage, and settles atomically.

import { getBindings, getSupabaseAdmin } from "@/runtime/env";
import { quoteRealtimeRecovery, refreshRealtimeBillingReviews, syncRealtimeBillingReviewSummaries } from "./realtime-billing-review";
import { syncWorkspaceUsageRollupForRequest } from "@core/workspace-usage-rollups";
import { loadPriceCard } from "@pipeline/pricing/loader";
import { computeBill } from "@pipeline/pricing/engine";
import type { PriceCard } from "@pipeline/pricing/types";
import { ulid } from "@pipeline/before/genId";
import { fetchGatewayContext } from "@pipeline/before/context";
import { buildProviderCandidatesWithDiagnostics } from "@pipeline/before/utils";
import { applyWorkspacePolicy, fetchWorkspacePolicy } from "@pipeline/before/workspacePolicy";
import { enqueueAsyncGenAiOtlpExport } from "@observability/otlp-export";
import { isLiveModel, liveConfig, createLiveConfig, priceLiveUsage, assertLiveFinalUsage, livePolicyCandidates, liveUsageMeters, LIVE_VOICES, type LiveUsage } from "./live-sessions";

export const REALTIME_INITIAL_HOLD_NANOS = 5_000_000_000;
export const REALTIME_HOLD_INCREMENT_NANOS = 5_000_000_000;
export const REALTIME_EXTEND_THRESHOLD = 0.8;
export const REALTIME_GRACEFUL_STOP_THRESHOLD = 0.95;
// Provider session limits are the only time caps on a relayed call. Each is
// counted from when the relay connects (claims) the session, not from creation.
export const OPENAI_REALTIME_MAX_DURATION_SECONDS = 60 * 60;
export const XAI_REALTIME_MAX_DURATION_SECONDS = 120 * 60;
// Google closes each Live connection after about 10 minutes (goAway ~50 s
// before) and the relay resumes it on a new connection. With context window
// compression the provider sets no session limit, and resumption handles stay
// valid for 2 hours. One hour bounds the number of reconnects (each re-bills the
// carried context as input tokens, which usageMetadata reports and we bill).
export const GOOGLE_REALTIME_MAX_DURATION_SECONDS = 60 * 60;
export const LIVE_MAX_DURATION_SECONDS = 25 * 60;
// The longest any relay session may run, whatever its provider.
export const REALTIME_RELAY_MAX_DURATION_SECONDS = XAI_REALTIME_MAX_DURATION_SECONDS;
// session.warning max_duration_approaching is sent this many seconds before the cap.
export const REALTIME_DURATION_WARNING_SECONDS = [120, 30] as const;
// Playground (source "chat") sessions only: API sessions never end for being idle.
export const REALTIME_IDLE_TIMEOUT_SECONDS = 5 * 60;
// A session whose relay is never claimed is reaped after this long.
export const REALTIME_UNCLAIMED_SESSION_TIMEOUT_SECONDS = 2 * 60;
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
export type GoogleRealtimeThinkingLevel = "low" | "medium" | "high";

export function isRealtimeRelaySecret(value: string): boolean {
	return /^rtsec_[0-9a-hjkmnp-tv-z]{52}$/.test(value);
}

export type RealtimeOtelContext = {
	traceId: string;
	parentSpanId: string;
	traceFlags: number;
	traceState?: string | null;
};

export function realtimeOtelContext(
	session: Pick<RealtimeSessionRow, "metadata">,
	key: "submission" | "parent" = "submission",
): RealtimeOtelContext | null {
	const metadata = session.metadata && typeof session.metadata === "object" ? session.metadata : {};
	const raw = metadata[`phaseo_otel_${key}_context`];
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
	const value = raw as Record<string, unknown>;
	const traceId = String(value.traceId ?? "");
	const parentSpanId = String(value.parentSpanId ?? "");
	if (!/^[0-9a-f]{32}$/.test(traceId) || !/^[0-9a-f]{16}$/.test(parentSpanId)) return null;
	return {
		traceId,
		parentSpanId,
		traceFlags: Number(value.traceFlags ?? 1) & 1,
		traceState: typeof value.traceState === "string" ? value.traceState : null,
	};
}

export function realtimeMaxDurationSeconds(provider: RealtimeProvider, model?: string | null): number {
	if (provider === "google-ai-studio") return GOOGLE_REALTIME_MAX_DURATION_SECONDS;
	if (provider === "x-ai" || provider === "spacex-ai") return XAI_REALTIME_MAX_DURATION_SECONDS;
	if (model && isLiveModel(model)) return LIVE_MAX_DURATION_SECONDS;
	return OPENAI_REALTIME_MAX_DURATION_SECONDS;
}

/** API sessions are never ended by the gateway for idleness, spend limits or holds. */
export function isPlaygroundRealtimeSession(session: Pick<RealtimeSessionRow, "source"> | null | undefined): boolean {
	return session?.source === "chat";
}

/**
 * Where a session stands against the overdraft cap, mirroring
 * gateway_realtime_settle_once: the cost is charged from the session's holds,
 * then free balance, then up to REALTIME_MAX_OVERDRAFT_NANOS of debt.
 */
export function computeRealtimeFundingPosition(args: {
	estimatedCostNanos: number;
	sessionReservedNanos: number;
	capturedNanos?: number;
	walletBalanceNanos: number;
	walletReservedNanos: number;
}): { overdraftUsedNanos: number; remainingNanos: number; capReached: boolean } {
	const due = Math.max(0, Math.round(args.estimatedCostNanos) - Math.max(0, Math.round(args.capturedNanos ?? 0)));
	const held = Math.max(0, Math.round(args.sessionReservedNanos));
	const free = Math.round(args.walletBalanceNanos) - Math.max(0, Math.round(args.walletReservedNanos));
	const overdraftUsedNanos = Math.max(0, due - held - Math.max(0, free));
	const remainingNanos = held + free + REALTIME_MAX_OVERDRAFT_NANOS - due;
	return { overdraftUsedNanos, remainingNanos, capReached: remainingNanos <= 0 };
}

export async function getRealtimeFundingPosition(session: RealtimeSessionRow) {
	const { data, error } = await getSupabaseAdmin()
		.from("wallets")
		.select("balance_nanos,reserved_nanos")
		.eq("workspace_id", session.workspace_id)
		.maybeSingle();
	if (error) throw error;
	return computeRealtimeFundingPosition({
		estimatedCostNanos: Number(session.estimated_cost_nanos ?? 0) || 0,
		sessionReservedNanos: Number(session.reserved_nanos ?? 0) || 0,
		capturedNanos: Number(session.captured_nanos ?? 0) || 0,
		walletBalanceNanos: Number(data?.balance_nanos ?? 0) || 0,
		walletReservedNanos: Number(data?.reserved_nanos ?? 0) || 0,
	});
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
	/** Not a column: spend-limit reasons the recheck found on an API session, which only warn. */
	policy_warnings?: string[];
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
	/** Charged beyond holds and free balance (wallet went negative, within the overdraft cap). */
	debt_nanos?: number | null;
	/** Priced cost beyond the overdraft cap that could not be charged. */
	uncollected_nanos?: number | null;
};

/** Maximum negative wallet balance a realtime settlement may create. Mirrors the SQL constant. */
export const REALTIME_MAX_OVERDRAFT_NANOS = 1_000_000_000;

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

export function providerFromModel(model: string, explicitProvider?: string | null): RealtimeProvider | null {
	const provider = String(explicitProvider ?? "").trim().toLowerCase();
	if (provider === "openai") return "openai";
	if (provider === "xai" || provider === "x-ai" || provider === "spacex-ai") return "spacex-ai";
	if (provider === "google" || provider === "google-ai-studio") return "google-ai-studio";
	const normalized = model.trim().toLowerCase();
	if (normalized.startsWith("openai/")) return "openai";
	if (/^(x-ai|xai|spacex-ai)\//.test(normalized)) return "spacex-ai";
	if (normalized.startsWith("google/")) return "google-ai-studio";
	return null;
}

export function canonicalModel(provider: RealtimeProvider, model: string): string {
	const trimmed = model.trim();
	if (!trimmed.includes("/")) {
		if (provider === "openai") return `openai/${trimmed}`;
		if (provider === "x-ai" || provider === "spacex-ai") return `spacex-ai/${trimmed}`;
		return `google/${trimmed}`;
	}
	if (provider === "x-ai" || provider === "spacex-ai") return trimmed.replace(/^(xai|x-ai)\//, "spacex-ai/");
	return trimmed;
}

function providerModel(provider: RealtimeProvider, model: string): string {
	const canonical = canonicalModel(provider, model);
	if (provider === "openai") return canonical.replace(/^openai\//, "");
	if (provider === "x-ai" || provider === "spacex-ai") return canonical.replace(/^spacex-ai\//, "");
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
	thinkingLevel?: GoogleRealtimeThinkingLevel | null;
	/**
	 * Relay only: ask Google for resumption handles (null) or resume from one
	 * (a handle). Omitted for ephemeral tokens handed to clients.
	 */
	resumptionHandle?: string | null;
}) {
	const voice = normalizeText(args?.voice) ?? "Puck";
	const model = normalizeText(args?.model) ?? "gemini-3.1-flash-live-preview";
	const extendedThinking = model === "gemini-3.8-live-extended-thinking";
	return {
		model: `models/${model}`,
		generationConfig: {
			responseModalities: ["AUDIO"],
			temperature: 0.7,
			...(extendedThinking
				? { thinkingConfig: { thinkingLevel: (args?.thinkingLevel ?? "low").toUpperCase() } }
				: {}),
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
			// Silence between activity is not part of a turn, so it is never
			// tokenized or billed (relied on when the relay forwards mic silence).
			turnCoverage: "TURN_INCLUDES_ONLY_ACTIVITY",
		},
		...(args?.resumptionHandle !== undefined
			? { sessionResumption: args.resumptionHandle ? { handle: args.resumptionHandle } : {} }
			: {}),
	};
}

export function buildGoogleRealtimeAuthTokenRequest(
	now = Date.now(),
	args?: {
		model?: string | null;
		voice?: string | null;
		instructions?: string | null;
		thinkingLevel?: GoogleRealtimeThinkingLevel | null;
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
	// Preserve fractional milliseconds across chunks; rounding each packet
	// makes a duration-based bill depend on the provider's packet sizes.
	return (samples / sampleRate) * 1000;
}

export function resolveRealtimeFinalCostNanos(args: {
	auth: Pick<RealtimeAuthContext, "internal">;
	finalCostNanos?: number | null;
	providerCostNanos?: number | null;
	pricedCostNanos: number;
}): number {
	if (args.auth.internal === true && args.finalCostNanos != null) {
		return Math.max(0, Math.round(args.finalCostNanos));
	}
	const priced = Math.max(0, Math.round(args.pricedCostNanos));
	// A provider-reported cost may cover only part of what the provider bills
	// (for example per-response tokens on a duration-billed session), so it can
	// raise the charge but never lower it.
	if (args.auth.internal === true && args.providerCostNanos != null) {
		return Math.max(priced, Math.round(args.providerCostNanos));
	}
	return priced;
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
	thinkingLevel?: GoogleRealtimeThinkingLevel | null;
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
	const source = rawUsage && typeof rawUsage === "object"
		? { ...rawUsage, ...(rawUsage.live_started === true ? liveUsageMeters(rawUsage) : {}) } as any : {};
	const usageMetadata = source.usageMetadata && typeof source.usageMetadata === "object"
		? source.usageMetadata as any
		: source;
	const googlePromptDetails = usageMetadata.promptTokensDetails ?? usageMetadata.prompt_tokens_details;
	const googleResponseDetails = usageMetadata.responseTokensDetails ?? usageMetadata.response_tokens_details;
	const googleInputText = modalityTokens(googlePromptDetails, "text");
	const googleInputAudio = modalityTokens(googlePromptDetails, "audio");
	const googleOutputText = modalityTokens(googleResponseDetails, "text");
	const googleOutputAudio = modalityTokens(googleResponseDetails, "audio");
	const googleInputImage = modalityTokens(googlePromptDetails, "image");
	const googleInputVideo = modalityTokens(googlePromptDetails, "video");

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
	// OpenAI reports image input (and its cached part) inside input_token_details; Gemini Live
	// reports IMAGE and VIDEO prompt modalities. Both are priced on their own meters.
	const inputImage =
		toFiniteNumber(source.input_image_tokens) ??
		getNumberAtPath(source, "input_token_details.image_tokens") ??
		getNumberAtPath(source, "input_tokens_details.image_tokens") ??
		(googleInputImage > 0 ? googleInputImage : null);
	const cachedImage =
		toFiniteNumber(source.cached_read_image_tokens) ??
		getNumberAtPath(source, "input_token_details.cached_tokens_details.image_tokens") ??
		getNumberAtPath(source, "input_tokens_details.cached_tokens_details.image_tokens");
	const inputVideo =
		toFiniteNumber(source.input_video_tokens) ??
		(googleInputVideo > 0 ? googleInputVideo : null);
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
		// Canonical meters already exclude cache reads. Only split raw provider totals.
		...(inputText != null ? { input_text_tokens: Math.max(0, inputText - (source.input_text_tokens != null ? 0 : cachedText ?? 0)) } : {}),
		...(inputAudio != null
			? { input_audio_tokens: Math.max(0, inputAudio - (source.input_audio_tokens != null ? 0 : cachedAudio ?? 0)) }
			: {}),
		...(outputText != null ? { output_text_tokens: outputText } : {}),
		...(outputAudio != null
			? { output_audio_tokens: outputAudio }
			: {}),
		...(cachedText != null ? { cached_read_text_tokens: cachedText } : {}),
		...(cachedAudio != null ? { cached_read_audio_tokens: cachedAudio } : {}),
		...(inputImage != null
			? { input_image_tokens: Math.max(0, inputImage - (source.input_image_tokens != null ? 0 : cachedImage ?? 0)) }
			: {}),
		...(cachedImage != null ? { cached_read_image_tokens: cachedImage } : {}),
		...(inputVideo != null ? { input_video_tokens: inputVideo } : {}),
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
	estimated?: boolean;
}) {
	if (args.provider === "x-ai" || args.provider === "spacex-ai") return;
	const responseInFlight = args.usage.assistant_response_in_flight === true;
	if (responseInFlight) {
		throw new Error(`${args.provider}_realtime_authoritative_usage_pending`);
	}
	// The relay already converted the unconfirmed turn into estimated meters
	// (possibly zero, when no model turn followed the speech).
	if (args.estimated === true) return;
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
		(toFiniteNumber(args.usage.cached_read_audio_tokens) ?? 0) +
		(toFiniteNumber(args.usage.input_image_tokens) ?? 0) +
		(toFiniteNumber(args.usage.input_video_tokens) ?? 0) +
		(toFiniteNumber(args.usage.cached_read_image_tokens) ?? 0);
	if (tokenMeters > 0) return;
	throw new Error(`${args.provider}_realtime_usage_missing_token_meters`);
}

/**
 * Price a realtime session. Image and video input on a card without its own row for them is
 * billed on the matching text meter rather than dropped (or failing on an unpriced cache meter).
 */
export function priceRealtimeUsage(usage: Record<string, unknown>, card: PriceCard): Record<string, any> {
	const hasRule = (meter: string) => card.rules.some((rule) => rule.meter === meter);
	const folded: Record<string, unknown> = { ...usage };
	const fold = (meter: string, into: string) => {
		if (hasRule(meter)) return;
		const quantity = toFiniteNumber(folded[meter]) ?? 0;
		if (quantity > 0) folded[into] = (toFiniteNumber(folded[into]) ?? 0) + quantity;
		delete folded[meter];
	};
	fold("input_image_tokens", "input_text_tokens");
	fold("input_video_tokens", "input_text_tokens");
	fold("cached_read_image_tokens", hasRule("cached_read_text_tokens") ? "cached_read_text_tokens" : "input_text_tokens");
	return computeBill(folded, card, { endpoint: "audio.realtime" });
}

async function requireRealtimePriceCard(provider: RealtimeProvider, modelId: string) {
	const card = await loadPriceCard(provider, modelId, "audio.realtime");
	if (!card || !Array.isArray(card.rules) || card.rules.length === 0) {
		throw new Error("realtime_price_card_missing");
	}
	return card;
}

/** Reasons that end a call on every source: the caller lost access. */
export const REALTIME_ACCESS_END_REASONS = [
	"realtime_key_revoked",
	"realtime_key_expired",
	"realtime_key_blocked",
	"realtime_workspace_disabled",
	"realtime_workspace_policy_blocked",
	"realtime_provider_not_available",
] as const;
/** Spend limits end playground calls but only warn on API calls. */
export const REALTIME_SPEND_LIMIT_REASONS = [
	"realtime_key_limit_exceeded",
	"realtime_key_cost_limit_reached",
] as const;

/**
 * Policy changes made in settings. The relay warns, rechecks after a grace
 * period and ends the call only if the block still applies.
 */
export const REALTIME_POLICY_GRACE_REASONS = [
	"realtime_workspace_policy_blocked",
	"realtime_provider_not_available",
] as const;

export function realtimeAccessEndReason(message: string): string | null {
	return REALTIME_ACCESS_END_REASONS.find((reason) => message.includes(reason)) ?? null;
}

export function isRealtimePolicyGraceReason(reason: string): boolean {
	return REALTIME_POLICY_GRACE_REASONS.some((graceReason) => reason.includes(graceReason));
}

/** Key limits, or a workspace budget raised by gateway_workspace_budget_status. */
export function isRealtimeSpendLimitReason(message: string): boolean {
	return REALTIME_SPEND_LIMIT_REASONS.some((reason) => message.includes(reason))
		|| /workspace_[a-z]+_cost_budget_reached/.test(message);
}

type RealtimePolicyOutcome = { ok: true } | { ok: false; reason: string; spendLimit: boolean };

/**
 * Reads the key and workspace directly: the cached gateway context does not
 * reflect a key revoked or paused after the session started.
 */
async function realtimeKeyAccessReason(session: RealtimeSessionRow): Promise<string | null> {
	if (!session.key_id) return null;
	const supabase = getSupabaseAdmin();
	const { data: key, error } = await supabase
		.from("keys")
		.select("status,soft_blocked,expires_at,revoked_at")
		.eq("id", session.key_id)
		.maybeSingle();
	if (error) throw error;
	if (!key) {
		const { data: workspace, error: workspaceError } = await supabase
			.from("workspaces")
			.select("id")
			.eq("id", session.workspace_id)
			.maybeSingle();
		if (workspaceError) throw workspaceError;
		return workspace ? "realtime_key_revoked" : "realtime_workspace_disabled";
	}
	if (key.status !== "active" || key.revoked_at) return "realtime_key_revoked";
	if (key.soft_blocked === true) return "realtime_key_blocked";
	if (key.expires_at && Date.parse(String(key.expires_at)) <= Date.now()) return "realtime_key_expired";
	return null;
}

async function evaluateActiveRealtimePolicy(
	session: RealtimeSessionRow,
	estimatedCostNanos: number,
): Promise<RealtimePolicyOutcome> {
	const accessReason = await realtimeKeyAccessReason(session);
	if (accessReason) return { ok: false, reason: accessReason, spendLimit: false };
	const live = isLiveModel(session.model_id);
	const policyModel = live ? liveConfig(session.metadata).backendModel : session.model_id;
	const context = await fetchGatewayContext({
		workspaceId: session.workspace_id,
		apiKeyId: session.key_id ?? "00000000-0000-0000-0000-000000000000",
		model: policyModel,
		endpoint: live ? "text.generate" : "audio.realtime",
	});
	if (!context.key.ok) return { ok: false, reason: "realtime_key_revoked", spendLimit: false };
	let spendLimitReason: string | null = null;
	if (!context.keyLimit.ok && context.keyLimit.limitMetric !== "requests") {
		spendLimitReason = "realtime_key_limit_exceeded";
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
		return { ok: false, reason: "realtime_workspace_policy_blocked", spendLimit: false };
	}
	if (live && !applyWorkspacePolicy({ providers: livePolicyCandidates(candidates), resolvedModel: session.model_id,
		body: { model: session.model_id, provider }, workspacePolicy, teamSettings: context.teamSettings ?? null }).ok) {
		return { ok: false, reason: "realtime_workspace_policy_blocked", spendLimit: false };
	}
	if (!provider || !policyResult.providers.some((candidate) => candidate.providerId === provider)) {
		return { ok: false, reason: "realtime_provider_not_available", spendLimit: false };
	}
	if (spendLimitReason) return { ok: false, reason: spendLimitReason, spendLimit: true };
	for (const bucket of Object.values(context.keyLimit.buckets ?? {})) {
		if (!bucket || bucket.costLimitNanos <= 0) continue;
		if (bucket.costUsedNanos + Math.max(0, estimatedCostNanos) >= bucket.costLimitNanos) {
			return { ok: false, reason: "realtime_key_cost_limit_reached", spendLimit: true };
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
	thinkingLevel?: GoogleRealtimeThinkingLevel | null;
	source?: RealtimeSource;
	metadata?: Record<string, unknown>;
	otelTraceContext?: RealtimeOtelContext | null;
	relay?: boolean;
	liveBackendModel?: string;
	liveBackendSettings?: unknown;
}): Promise<{
	session: RealtimeSessionRow;
	clientSecret: string;
	connect: ProviderSession["connect"];
	raw: unknown;
}> {
	const telemetryStartedAtMs = Date.now();
	const provider = providerFromModel(args.model, args.provider);
	if (!provider) throw new Error("realtime_provider_required");
	const modelId = canonicalModel(provider, args.model);
	const providerModelId = providerModel(provider, args.model);
	const thinkingLevel =
		providerModelId === "gemini-3.8-live-extended-thinking"
			? args.thinkingLevel ?? "low"
			: null;
	const voice = defaultVoice(provider, args.voice);
	const live = isLiveModel(modelId);
	if (live && (!args.liveBackendModel || args.source !== "chat" || !args.auth.userId || args.relay === false)) {
		throw new Error("live_playground_only");
	}
	if (live && !LIVE_VOICES.includes(voice as typeof LIVE_VOICES[number])) throw new Error("live_voice_not_supported");
	const liveSettings = live ? await createLiveConfig(args.liveBackendModel!, args.liveBackendSettings) : null;
	if (!live) await requireRealtimePriceCard(provider, modelId);

	const supabase = getSupabaseAdmin();
	const sessionId = `rt_${ulid().toLowerCase()}`;
	const reservationPrefix = `rt:${sessionId}:`;
	const expiresAt = new Date(Date.now() + realtimeMaxDurationSeconds(provider, modelId) * 1000).toISOString();

	const useRelay = args.relay !== false || !args.auth.internal;
	const relaySecret = useRelay ? `rtsec_${ulid().toLowerCase()}${ulid().toLowerCase()}` : null;
	const secretHash = relaySecret ? await sha256Hex(relaySecret) : null;
	const submissionSpanId = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
	const submissionTraceId = args.otelTraceContext?.traceId
		?? crypto.randomUUID().replaceAll("-", "");
	const submissionContext: RealtimeOtelContext = {
		traceId: submissionTraceId,
		parentSpanId: submissionSpanId,
		traceFlags: args.otelTraceContext?.traceFlags ?? 1,
		traceState: args.otelTraceContext?.traceState ?? null,
	};
	const sessionMetadata = {
		...(args.metadata ?? {}),
		live: liveSettings,
		...(useRelay
			? {
					relay: true,
					instructions: args.instructions ?? null,
					...(thinkingLevel ? { thinking_level: thinkingLevel } : {}),
				}
			: {}),
		phaseo_otel_parent_context: args.otelTraceContext ?? null,
		phaseo_otel_submission_context: submissionContext,
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
	await enqueueAsyncGenAiOtlpExport({
		requestId: args.auth.requestId,
		workspaceId: args.auth.workspaceId,
		keyId: args.auth.apiKeyId,
		userId: args.auth.userId,
		operation: "realtime",
		phase: "submit",
		endpoint: "audio.realtime",
		model: modelId,
		provider,
		providerModel: providerModelId,
		sessionId,
		startedAtMs: telemetryStartedAtMs,
		completedAtMs: Date.now(),
		success: true,
		statusCode: 201,
		traceContext: args.otelTraceContext ?? null,
		spanId: submissionSpanId,
		requestPayload: {
			model: modelId,
			voice,
			instructions: args.instructions ?? null,
			...(thinkingLevel ? { thinking_level: thinkingLevel } : {}),
		},
	}).catch((error) => console.error("realtime_otel_submit_failed", {
		sessionId,
		error: error instanceof Error ? error.message : String(error),
	}));
	if (useRelay) {
		return {
			session: created,
			clientSecret: relaySecret!,
			connect: {
				transport: "websocket",
				url: `/v1/${live ? "live" : "realtime"}/sessions/${encodeURIComponent(sessionId)}/relay`,
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
							thinkingLevel,
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
	// Spend limits only warn on API sessions, so they do not block the hold either.
	if ("reason" in policy && (!policy.spendLimit || isPlaygroundRealtimeSession(session))) throw new Error(policy.reason);
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
	providerSessionId?: string;
	/** The provider cap counted from when the relay claimed the session. */
	expiresAt?: string | null;
}): Promise<RealtimeSessionRow> {
	const now = new Date().toISOString();
	const { data, error } = await getSupabaseAdmin()
		.from("gateway_realtime_sessions")
		.update({
			status: "connected",
			...(args.providerSessionId ? { provider_session_id: args.providerSessionId } : {}),
			...(args.expiresAt ? { expires_at: args.expiresAt } : {}),
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
	const normalizedUsage = normalizeRealtimeUsage(args.usage ?? session.usage ?? {});
	const pricedUsage = isLiveModel(session.model_id)
		? priceLiveUsage(normalizedUsage, liveConfig(session.metadata))
		: priceRealtimeUsage(normalizedUsage, await requireRealtimePriceCard(provider, session.model_id));
	const pricedNanos = pricedTotalNanos(pricedUsage);
	const estimatedCostNanos = Math.max(
		Math.max(0, Number(session.estimated_cost_nanos ?? 0) || 0),
		Math.max(0, Math.round(args.estimatedCostNanos ?? 0)),
		pricedNanos,
	);
	const policy = await evaluateActiveRealtimePolicy(session, estimatedCostNanos);
	// Lost access ends every call; a spend limit ends only playground calls. A
	// policy block comes back as a warning so the relay can give notice first.
	const ends = "reason" in policy
		&& !isRealtimePolicyGraceReason(policy.reason)
		&& (!policy.spendLimit || isPlaygroundRealtimeSession(session));
	const { data: updated, error: updateError } = await supabase
		.from("gateway_realtime_sessions")
		.update({
			...(ends && "reason" in policy
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
	return {
		...(updated as RealtimeSessionRow),
		...(!ends && "reason" in policy ? { policy_warnings: [policy.reason] } : {}),
	};
}

/**
 * Prices only provider-confirmed usage so the database can capture it now and
 * leave a billing review covering just the unconfirmed remainder. Pricing
 * failures fall back to zero: marking a session for review must not fail.
 */
export async function realtimeConfirmedCostNanos(args: {
	modelId: string;
	provider: string | null;
	metadata?: Record<string, unknown> | null;
	usage: Record<string, unknown>;
}): Promise<number> {
	try {
		if (isLiveModel(args.modelId)) {
			return quoteRealtimeRecovery(args.modelId, args.usage as LiveUsage, args.metadata ?? {}).costNanos;
		}
		const provider = providerFromModel(args.modelId, args.provider);
		if (!provider) return 0;
		const confirmed = { ...args.usage };
		delete confirmed.assistant_response_in_flight;
		// Estimated meters are not provider-confirmed.
		for (const [meter, estimate] of [
			["input_audio_tokens", "estimated_input_audio_tokens"],
			["output_audio_tokens", "estimated_output_audio_tokens"],
		] as const) {
			const value = toFiniteNumber(confirmed[meter]);
			if (value != null) confirmed[meter] = Math.max(0, value - (toFiniteNumber(confirmed[estimate]) ?? 0));
		}
		const priced = computeBill(normalizeRealtimeUsage(confirmed), await requireRealtimePriceCard(provider, args.modelId), {
			endpoint: "audio.realtime",
		});
		return pricedTotalNanos(priced);
	} catch (error) {
		console.error("realtime_confirmed_cost_failed", {
			modelId: args.modelId,
			error: error instanceof Error ? error.message : String(error),
		});
		return 0;
	}
}

export async function markRealtimeSessionBillingUnresolved(args: {
	auth: RealtimeAuthContext;
	sessionId: string;
	usage: Record<string, unknown>;
	reason: string;
	session?: Pick<RealtimeSessionRow, "model_id" | "provider" | "metadata"> | null;
}): Promise<RealtimeSessionRow> {
	const usage = normalizeRealtimeUsage(args.usage);
	const session = args.session ?? await getRealtimeSessionForInternal(args.sessionId).catch(() => null);
	const confirmedCostNanos = session
		? await realtimeConfirmedCostNanos({
			modelId: session.model_id,
			provider: session.provider,
			metadata: session.metadata ?? null,
			usage: args.usage,
		})
		: 0;
	const rpc = await getSupabaseAdmin().rpc("gateway_realtime_mark_billing_unresolved", {
		p_workspace_id: args.auth.workspaceId,
		p_session_id: args.sessionId,
		p_usage: usage,
		p_reason: args.reason,
		p_confirmed_cost_nanos: confirmedCostNanos,
	});
	if (rpc.error) throw rpc.error;
	const marked = (Array.isArray(rpc.data) ? rpc.data[0] : rpc.data) as RealtimeSessionRow | null;
	if (!marked) throw new Error("realtime_billing_unresolved_empty");
	return marked;
}

export async function settleRealtimeSession(args: {
	auth: RealtimeAuthContext;
	sessionId: string;
	status?: RealtimeTerminalStatus;
	usage?: Record<string, unknown>;
	finalCostNanos?: number | null;
	/** Internal relay only: cost the provider reported; never charges less than the priced usage. */
	providerCostNanos?: number | null;
	disconnectReason?: string | null;
	errorCode?: string | null;
	errorMessage?: string | null;
	/** Internal relay only: part of the usage was estimated from metered audio. */
	estimated?: boolean;
	estimateBasis?: string | null;
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
		await emitRealtimeFinalizationTelemetry(session);
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
	const normalizedUsage = normalizeRealtimeUsage(args.usage ?? {});
	const live = isLiveModel(session.model_id);
	const pricedUsage = live ? priceLiveUsage(normalizedUsage, liveConfig(session.metadata))
		: priceRealtimeUsage(normalizedUsage, await requireRealtimePriceCard(provider, session.model_id));
	const costNanos = live ? pricedTotalNanos(pricedUsage) : resolveRealtimeFinalCostNanos({
		auth: args.auth,
		finalCostNanos: args.finalCostNanos,
		providerCostNanos: args.providerCostNanos,
		pricedCostNanos: pricedTotalNanos(pricedUsage),
	});
	const lines = pricingLines(pricedUsage);
	const estimated = args.auth.internal === true && args.estimated === true;
	if (live) assertLiveFinalUsage(normalizedUsage);
	else assertRealtimeBillingMetersPresent({ provider, usage: normalizedUsage, costNanos, estimated });
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
		p_estimated: estimated,
		p_estimate_basis: estimated ? normalizeText(args.estimateBasis) ?? "metered_audio" : null,
	});
	if (rpc.error) throw rpc.error;
	const settlement = (Array.isArray(rpc.data) ? rpc.data[0] : rpc.data) as WalletSettlementResult | null;
	if (!settlement) throw new Error("realtime_settlement_empty");
	if (Number(settlement.debt_nanos ?? 0) > 0 || Number(settlement.uncollected_nanos ?? 0) > 0) {
		console.warn("realtime_settlement_overdraft", {
			sessionId: args.sessionId,
			workspaceId: args.auth.workspaceId,
			debtNanos: settlement.debt_nanos,
			uncollectedNanos: settlement.uncollected_nanos,
		});
	}
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
	if (settlement.applied === true) {
		await emitRealtimeFinalizationTelemetry(updated as RealtimeSessionRow);
	}

	return { session: updated as RealtimeSessionRow, settlement, pricedUsage };
}

async function emitRealtimeFinalizationTelemetry(completed: RealtimeSessionRow) {
	await enqueueAsyncGenAiOtlpExport({
		requestId: `realtime:${completed.session_id}`,
		workspaceId: completed.workspace_id,
		keyId: completed.key_id,
		userId: completed.user_id,
		operation: "realtime",
		phase: "finalize",
		endpoint: "audio.realtime",
		model: completed.model_id,
		provider: completed.provider,
		providerModel: completed.provider_model_id,
		sessionId: completed.session_id,
		startedAtMs: Date.parse(completed.started_at),
		completedAtMs: Date.parse(completed.ended_at ?? "") || Date.now(),
		success: completed.status === "completed",
		errorType: completed.status === "completed"
			? null
			: completed.error_code ?? completed.disconnect_reason ?? completed.status,
		usage: completed.usage,
		costNanos: completed.final_cost_nanos,
		currency: completed.currency,
		linkContext: realtimeOtelContext(completed),
	}).catch((otelError) => console.error("realtime_otel_finalize_failed", {
		sessionId: completed.session_id,
		error: otelError instanceof Error ? otelError.message : String(otelError),
	}));
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
	sessionsHealthy: number;
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
	// Sessions whose relay was never claimed hold credit for nothing.
	const unclaimedCutoff = new Date(Date.now() - REALTIME_UNCLAIMED_SESSION_TIMEOUT_SECONDS * 1000).toISOString();
	const { data: sessions, error } = await supabase
		.from("gateway_realtime_sessions")
		.select("*")
		.in("status", ["created", "connecting", "connected", "ending"])
		.or(`expires_at.lte.${now},last_event_at.lte.${idleCutoff},and(status.eq.created,created_at.lte.${unclaimedCutoff})`)
		.order("updated_at", { ascending: true })
		.limit(Math.max(1, Math.min(500, Math.trunc(args?.limit ?? 100))));
	if (error) throw error;

	let sessionsExpired = 0;
	let sessionsErrored = 0;
	let sessionsHealthy = 0;
	for (const row of sessions ?? []) {
		const session = row as RealtimeSessionRow;
		try {
			// A quiet API call is not stuck: only its relay can say whether the
			// sockets are gone. Without a relay binding, wait for its expiry.
			const expired = Boolean(session.expires_at && Date.parse(session.expires_at) <= Date.now());
			if (!args?.relay && !isPlaygroundRealtimeSession(session) && session.status !== "created" && !expired) {
				sessionsHealthy += 1;
				continue;
			}
			if (args?.relay) {
				const stub = args.relay.get(args.relay.idFromName(session.session_id));
				const response = await stub.fetch(
					new Request(`https://realtime.internal/internal/reconcile/${encodeURIComponent(session.session_id)}`, {
						method: "POST",
						headers: { "x-realtime-reconcile-token": await realtimeReconciliationToken() },
					}),
				);
				if (!response.ok) throw new Error(`realtime_relay_reconciliation_http_${response.status}`);
				const result = await response.json<{ active?: boolean; settled?: boolean; healthy?: boolean }>();
				if (result.active) {
					// Open sockets with recent traffic (or a bounded final-usage wait)
					// are not stuck; the relay settles them itself.
					if (result.healthy) {
						sessionsHealthy += 1;
						continue;
					}
					if (!result.settled) throw new Error("realtime_relay_reconciliation_pending");
					sessionsExpired += 1;
					continue;
				}
			}
			// Without relay state a created or connecting session never reached the
			// provider, so it settles at zero. Connected sessions lost evidence.
			const relayed = session.metadata?.relay === true;
			if (session.status !== "created" && !(relayed && session.status === "connecting")) {
				const provider = providerFromModel(session.model_id, session.provider);
				if (provider !== "spacex-ai") {
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
						session,
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

	await refreshRealtimeBillingReviews().catch((error) => {
		console.error("realtime_billing_review_refresh_failed", { error });
	});
	await syncRealtimeBillingReviewSummaries().catch((error) => {
		console.error("realtime_billing_review_summary_sync_failed", { error });
	});
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
		sessionsHealthy,
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
	// Counted from when the relay connects; expires_at moves to match at that point.
	const maxDurationSeconds = realtimeMaxDurationSeconds(
		providerFromModel(args.session.model_id, args.session.provider) ?? "openai",
		args.session.model_id,
	);
	const idleTimeoutSeconds = isPlaygroundRealtimeSession(args.session) ? REALTIME_IDLE_TIMEOUT_SECONDS : null;
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
		max_duration_seconds: maxDurationSeconds,
		idle_timeout_seconds: idleTimeoutSeconds,
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
			idleTimeoutSeconds,
			maxOverdraftUsd: REALTIME_MAX_OVERDRAFT_NANOS / 1_000_000_000,
			authoritative: true,
		},
		...(args.raw !== undefined ? { raw: args.raw } : {}),
	};
}
