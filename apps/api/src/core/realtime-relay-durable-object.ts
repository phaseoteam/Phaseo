// Purpose: Server-owned realtime voice WebSocket relay.
// Why: Billing-sensitive realtime sessions must survive client disconnects long enough to drain final provider usage.
// How: A Durable Object owns one provider WebSocket per session and settles the wallet from provider usage.

import { configureRuntime } from "@/runtime/env";
import type { GatewayBindings } from "@/runtime/env.types";
import {
	REALTIME_GRACEFUL_STOP_THRESHOLD,
	REALTIME_IDLE_TIMEOUT_SECONDS,
	REALTIME_MAX_DURATION_SECONDS,
	buildGoogleBidiGenerateContentSetup,
	claimRealtimeSessionForRelay,
	decideRealtimeRelayBudget,
	extendRealtimeSessionHold,
	getRealtimeSessionForInternal,
	isRealtimeRelaySecret,
	markRealtimeSessionBillingUnresolved,
	markRealtimeSessionConnected,
	normalizeRealtimeUsage,
	pcm16Base64DurationMs,
	realtimeReconciliationToken,
	realtimeOtelContext,
	resolveGoogleKey,
	resolveOpenAIKey,
	resolveXAIKey,
	settleRealtimeSession,
	sha256Hex,
	updateRealtimeSessionUsage,
	type RealtimeAuthContext,
	type RealtimeProvider,
	type RealtimeSessionRow,
} from "@core/realtime-sessions";
import { enqueueAsyncGenAiOtlpExport } from "@observability/otlp-export";
import { isLiveModel, liveConfig, liveStartEvent, ingestLiveUsage, assertLiveFinalUsage, priceLiveUsage, liveUsageMeters, type LiveUsage } from "./live-sessions";

const GOOGLE_LIVE_URL =
	"wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";
const RELAY_DRAIN_TIMEOUT_MS = 20_000;
const RELAY_AUTHORITATIVE_USAGE_TIMEOUT_MS = 10_000;
const RELAY_USAGE_CHECKPOINT_INTERVAL_MS = 1_000;
const RELAY_USAGE_PERSIST_INTERVAL_MS = 5_000;
const RELAY_SETTLEMENT_RETRY_MS = 15_000;
const RELAY_MAX_MESSAGE_BYTES = 96 * 1024;
const RELAY_MAX_AUDIO_CHUNK_MS = 1_000;
const RELAY_MIN_AUDIO_CHUNK_MS = 10;
const RELAY_AUDIO_LEAD_ALLOWANCE_MS = 2_000;
const RELAY_MAX_BUFFERED_BYTES = 512 * 1024;
const XAI_OUTPUT_SAMPLE_RATE = 24_000;
const OPENAI_INPUT_SAMPLE_RATE = 24_000;
const XAI_INPUT_SAMPLE_RATE = 24_000;
const GOOGLE_INPUT_SAMPLE_RATE = 16_000;
const GOOGLE_OUTPUT_SAMPLE_RATE = 24_000;
const OPENAI_OUTPUT_SAMPLE_RATE = 24_000;
const GOOGLE_SPEECH_RMS_THRESHOLD = 0.012;
const GOOGLE_SILENCE_END_MS = 1_000;
// Server VAD keeps this much audio before detected speech in the committed buffer.
const OPENAI_VAD_PREFIX_PADDING_MS = 300;
// After this many failed settlement attempts the session moves to billing
// review instead of retrying forever.
const RELAY_SETTLEMENT_MAX_ATTEMPTS = 20;
// Documented audio token rates, confirmed against recorded sessions on
// 2026-10-22 (OpenAI 10/s in and ~20/s out; Google 29-32/s out). Used only to
// estimate a turn whose provider usage never arrived because the connection
// ended mid-turn.
export const REALTIME_ESTIMATE_AUDIO_TOKENS_PER_SECOND: Record<"openai" | "google-ai-studio", { input: number; output: number }> = {
	openai: { input: 10, output: 20 },
	"google-ai-studio": { input: 32, output: 32 },
};

type RelayUsageAggregate = LiveUsage & {
	input_text_tokens?: number;
	output_text_tokens?: number;
	input_audio_tokens?: number;
	output_audio_tokens?: number;
	cached_read_text_tokens?: number;
	cached_read_audio_tokens?: number;
	input_image_tokens?: number;
	input_video_tokens?: number;
	cached_read_image_tokens?: number;
	input_audio_ms?: number;
	received_audio_ms?: number;
	output_audio_ms?: number;
	audio_ms?: number;
	input_text_messages?: number;
	assistant_response_in_flight?: boolean;
	input_audio_pending?: boolean;
	input_audio_clear_pending?: boolean;
	provider_cost_usd_ticks?: number;
	provider_cost_nanos?: number;
	// Metered audio for the turn in progress; only used to estimate an interrupted turn.
	pending_input_audio_ms?: number;
	pending_vad_input_audio_ms?: number;
	pending_output_audio_ms?: number;
	billing_estimated?: boolean;
	estimate_basis?: string;
	estimated_input_audio_tokens?: number;
	estimated_output_audio_tokens?: number;
	// Connected provider wall-clock time (xAI server VAD sessions bill duration).
	provider_connected_at_ms?: number;
	provider_last_seen_ms?: number;
	provider_closed_at_ms?: number;
	session_audio_ms?: number;
};

type RelayProviderState = {
	seenResponseIds: string[];
	googleTurnActive: boolean;
	googleTurnComplete: boolean;
	googleTurnUsage: RelayUsageAggregate;
};

type ClientAudioMessage = {
	type: "client.audio";
	audio?: string;
	rms?: number;
};

type PendingSettlement = {
	status: "completed" | "failed" | "cancelled" | "expired";
	reason: string;
	phase?: "drain" | "authoritative" | "settle";
	// Client disconnects settle as completed once any response has completed.
	statusFromResponses?: boolean;
};

const STORAGE_SESSION_ID = "session_id";
const STORAGE_USAGE = "usage";
const STORAGE_PENDING_SETTLEMENT = "pending_settlement";
const STORAGE_PROVIDER_STATE = "provider_state";
const STORAGE_SETTLEMENT_ATTEMPTS = "settlement_attempts";
const OPENAI_BILLING_EVENT_TYPES = new Set([
	"input_audio_buffer.committed",
	"response.created",
	"response.output_item.added",
	"response.content_part.added",
	"response.output_audio.delta",
	"response.output_audio.done",
	"response.done",
]);
const LIVE_BILLING_EVENT_TYPES = new Set([
	"session.started",
	"session.usage.updated",
	"session.closed",
	"session.delegation.created",
	"response.event",
]);

export function validateRealtimeAudioIngress(args: {
	base64: string;
	sampleRate: number;
	currentInputMs: number;
	elapsedMs: number;
}): { ok: true; durationMs: number } | { ok: false; reason: string } {
	const value = args.base64.trim();
	if (!value || value.length > RELAY_MAX_MESSAGE_BYTES || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
		return { ok: false, reason: "realtime_audio_invalid_base64" };
	}
	try { atob(value); } catch { return { ok: false, reason: "realtime_audio_invalid_base64" }; }
	const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
	const byteLength = Math.floor((value.length * 3) / 4) - padding;
	if (byteLength <= 0 || byteLength % 2 !== 0) {
		return { ok: false, reason: "realtime_audio_invalid_pcm16" };
	}
	const durationMs = pcm16Base64DurationMs(value, args.sampleRate);
	if (durationMs < RELAY_MIN_AUDIO_CHUNK_MS || durationMs > RELAY_MAX_AUDIO_CHUNK_MS) {
		return { ok: false, reason: "realtime_audio_chunk_too_large" };
	}
	if (args.currentInputMs + durationMs > REALTIME_MAX_DURATION_SECONDS * 1000) {
		return { ok: false, reason: "realtime_audio_duration_exceeded" };
	}
	if (args.currentInputMs + durationMs > Math.max(0, args.elapsedMs) + RELAY_AUDIO_LEAD_ALLOWANCE_MS) {
		return { ok: false, reason: "realtime_audio_rate_exceeded" };
	}
	return { ok: true, durationMs };
}

function toNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function metadataRecord(session: RealtimeSessionRow): Record<string, unknown> {
	return session.metadata && typeof session.metadata === "object"
		? session.metadata
		: {};
}

function providerFromSession(session: RealtimeSessionRow): RealtimeProvider {
	const provider = String(session.provider ?? "").trim().toLowerCase();
	if (provider === "xai" || provider === "x-ai") return "spacex-ai";
	if (provider === "google") return "google-ai-studio";
	return provider as RealtimeProvider;
}

function authForSession(session: RealtimeSessionRow, requestId: string): RealtimeAuthContext {
	return {
		requestId,
		workspaceId: session.workspace_id,
		apiKeyId: session.key_id ?? "00000000-0000-0000-0000-000000000000",
		userId: session.user_id ?? null,
		internal: true,
	};
}

function wsUrlToFetchUrl(url: string): string {
	return url.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
}

async function parseMessageData(data: unknown): Promise<string | null> {
	if (typeof data === "string") return data;
	if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
	if (ArrayBuffer.isView(data)) {
		return new TextDecoder().decode(
			new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
		);
	}
	if (typeof Blob !== "undefined" && data instanceof Blob) return data.text();
	return null;
}

function parseJson(value: string): Record<string, unknown> | null {
	try {
		const parsed = JSON.parse(value) as unknown;
		return parsed && typeof parsed === "object"
			? (parsed as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

function getRecordField(
	record: Record<string, unknown>,
	key: string,
): Record<string, unknown> | null {
	const value = record[key];
	return value && typeof value === "object"
		? (value as Record<string, unknown>)
		: null;
}

function getStringField(record: Record<string, unknown>, key: string): string {
	const value = record[key];
	return typeof value === "string" ? value : "";
}

function getArrayField<T = unknown>(
	record: Record<string, unknown>,
	key: string,
): T[] {
	const value = record[key];
	return Array.isArray(value) ? (value as T[]) : [];
}

function addDuration(
	current: RelayUsageAggregate,
	field: "input_audio_ms" | "output_audio_ms",
	durationMs: number,
): RelayUsageAggregate {
	const nextValue = Math.max(0, toNumber(current[field]) + Math.max(0, durationMs));
	const next: RelayUsageAggregate = { ...current, [field]: nextValue };
	next.audio_ms = toNumber(next.input_audio_ms) + toNumber(next.output_audio_ms);
	return next;
}

function getGoogleModalityTokens(details: unknown, modality: string): number {
	if (!Array.isArray(details)) return 0;
	return details.reduce((total, item) => {
		if (!item || typeof item !== "object") return total;
		const record = item as Record<string, unknown>;
		const itemModality = String(record.modality ?? record.type ?? "").toLowerCase();
		if (itemModality !== modality) return total;
		return total + toNumber(record.tokenCount ?? record.token_count);
	}, 0);
}

function addOpenAIUsage(current: RelayUsageAggregate, usage: Record<string, unknown>): RelayUsageAggregate {
	const normalized = normalizeRealtimeUsage(usage) as RelayUsageAggregate;
	return {
		...current,
		input_text_tokens: toNumber(current.input_text_tokens) + toNumber(normalized.input_text_tokens),
		input_audio_tokens: toNumber(current.input_audio_tokens) + toNumber(normalized.input_audio_tokens),
		output_text_tokens: toNumber(current.output_text_tokens) + toNumber(normalized.output_text_tokens),
		output_audio_tokens: toNumber(current.output_audio_tokens) + toNumber(normalized.output_audio_tokens),
		cached_read_text_tokens:
			toNumber(current.cached_read_text_tokens) + toNumber(normalized.cached_read_text_tokens),
		cached_read_audio_tokens:
			toNumber(current.cached_read_audio_tokens) + toNumber(normalized.cached_read_audio_tokens),
		input_image_tokens: toNumber(current.input_image_tokens) + toNumber(normalized.input_image_tokens),
		cached_read_image_tokens:
			toNumber(current.cached_read_image_tokens) + toNumber(normalized.cached_read_image_tokens),
	};
}

export function googleUsageSnapshot(usage: Record<string, unknown>): RelayUsageAggregate {
	const promptDetails = usage.promptTokensDetails ?? usage.prompt_tokens_details;
	const responseDetails = usage.responseTokensDetails ?? usage.response_tokens_details;
	const thoughts = toNumber(usage.thoughtsTokenCount ?? usage.thoughts_token_count);
	return {
		input_text_tokens: getGoogleModalityTokens(promptDetails, "text"),
		input_audio_tokens: getGoogleModalityTokens(promptDetails, "audio"),
		output_text_tokens: getGoogleModalityTokens(responseDetails, "text") + thoughts,
		output_audio_tokens: getGoogleModalityTokens(responseDetails, "audio"),
		input_image_tokens: getGoogleModalityTokens(promptDetails, "image"),
		input_video_tokens: getGoogleModalityTokens(promptDetails, "video"),
	};
}

function addTokenUsage(current: RelayUsageAggregate, addition: RelayUsageAggregate): RelayUsageAggregate {
	return {
		...current,
		input_text_tokens: toNumber(current.input_text_tokens) + toNumber(addition.input_text_tokens),
		input_audio_tokens: toNumber(current.input_audio_tokens) + toNumber(addition.input_audio_tokens),
		output_text_tokens: toNumber(current.output_text_tokens) + toNumber(addition.output_text_tokens),
		output_audio_tokens: toNumber(current.output_audio_tokens) + toNumber(addition.output_audio_tokens),
		cached_read_text_tokens:
			toNumber(current.cached_read_text_tokens) + toNumber(addition.cached_read_text_tokens),
		cached_read_audio_tokens:
			toNumber(current.cached_read_audio_tokens) + toNumber(addition.cached_read_audio_tokens),
		input_image_tokens: toNumber(current.input_image_tokens) + toNumber(addition.input_image_tokens),
		input_video_tokens: toNumber(current.input_video_tokens) + toNumber(addition.input_video_tokens),
		cached_read_image_tokens:
			toNumber(current.cached_read_image_tokens) + toNumber(addition.cached_read_image_tokens),
	};
}

export function mergeGoogleUsageSnapshot(
	current: RelayUsageAggregate,
	next: RelayUsageAggregate,
): RelayUsageAggregate {
	return {
		input_text_tokens: Math.max(toNumber(current.input_text_tokens), toNumber(next.input_text_tokens)),
		input_audio_tokens: Math.max(toNumber(current.input_audio_tokens), toNumber(next.input_audio_tokens)),
		output_text_tokens: Math.max(toNumber(current.output_text_tokens), toNumber(next.output_text_tokens)),
		output_audio_tokens: Math.max(toNumber(current.output_audio_tokens), toNumber(next.output_audio_tokens)),
		input_image_tokens: Math.max(toNumber(current.input_image_tokens), toNumber(next.input_image_tokens)),
		input_video_tokens: Math.max(toNumber(current.input_video_tokens), toNumber(next.input_video_tokens)),
	};
}

export function googleUsageToAggregate(current: RelayUsageAggregate, usage: Record<string, unknown>): RelayUsageAggregate {
	return addTokenUsage(current, googleUsageSnapshot(usage));
}

async function connectWebSocket(url: string, init?: RequestInit): Promise<WebSocket> {
	const response = await fetch(wsUrlToFetchUrl(url), {
		...(init ?? {}),
		headers: {
			...(init?.headers ?? {}),
			Upgrade: "websocket",
		},
	});
	const socket = (response as Response & { webSocket?: WebSocket }).webSocket;
	if (response.status !== 101 || !socket) {
		const body = await response.text().catch(() => "");
		const detail = body.trim().slice(0, 500);
		throw new Error(
			detail
				? `realtime_relay_upstream_http_${response.status}: ${detail}`
				: `realtime_relay_upstream_http_${response.status}`,
		);
	}
	socket.accept();
	return socket;
}

async function openAIRealtimeHeaders(key: string, session: RealtimeSessionRow): Promise<HeadersInit> {
	const headers: Record<string, string> = {
		Authorization: `Bearer ${key}`,
	};
	if (session.user_id) {
		headers["OpenAI-Safety-Identifier"] = await sha256Hex(`realtime:${session.user_id}`);
	}
	return headers;
}

function relayTokenFromRequest(request: Request): { token: string; responseProtocol?: string } {
	const protocols = (request.headers.get("Sec-WebSocket-Protocol") ?? "")
		.split(",")
		.map((protocol) => protocol.trim())
		.filter(Boolean);
	const tokenProtocol = protocols.find((protocol) => protocol.startsWith("rtsec."));
	return {
		token: tokenProtocol?.slice("rtsec.".length) ?? "",
		responseProtocol: protocols.includes("statsync-realtime") ? "statsync-realtime" : undefined,
	};
}

function inputSampleRate(provider: RealtimeProvider): number {
	if (provider === "google-ai-studio") return GOOGLE_INPUT_SAMPLE_RATE;
	if (provider === "spacex-ai") return XAI_INPUT_SAMPLE_RATE;
	return OPENAI_INPUT_SAMPLE_RATE;
}

export class RealtimeRelayDurableObject {
	private state: DurableObjectState;
	private env: GatewayBindings;
	private client: WebSocket | null = null;
	private upstream: WebSocket | null = null;
	private session: RealtimeSessionRow | null = null;
	private usage: RelayUsageAggregate = {};
	private providerState: RelayProviderState = {
		seenResponseIds: [],
		googleTurnActive: false,
		googleTurnComplete: false,
		googleTurnUsage: {},
	};
	private responseInFlight = false;
	private providerSetupComplete = false;
	private upstreamEvents: Promise<void> = Promise.resolve();
	private providerEventSeen = false;
	private providerCompletedResponseSeen = false;
	private settled = false;
	private acceptingAudio = true;
	private budgetClosing = false;
	private drainTimer: number | null = null;
	private idleTimer: number | null = null;
	private clientGoneHandled = false;
	private lastUsageCheckpointAt = 0;
	private lastUsagePersistAt = 0;
	private audioStartedAt = 0;
	private receivedAudioMs = 0;
	private settling = false;
	private inputSinceLastResponse = false;
	private turnStartedAtMs = 0;
	private googleAudioActive = false;
	private googleSilenceMs = 0;
	private openAISpeechActive = false;
	private openAIInputCommitted = false;
	private waitingForOpenAIInputClear = false;
	private openAISpeechStartMs: number | null = null;
	private liveClosing = false;
	private pendingSettlement: PendingSettlement | null = null;
	// Responses created while ending for a disconnect or failure are cancelled,
	// not played to nobody and billed.
	private cancelResponsesOnDrain = false;
	private lastActivityAt = 0;

	private get isLive() { return isLiveModel(this.session?.model_id); }

	constructor(state: DurableObjectState, env: GatewayBindings) {
		this.state = state;
		this.env = env;
		configureRuntime(env);
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		if (request.method === "POST" && /^\/internal\/reconcile\/[^/]+$/.test(url.pathname)) {
			const expectedToken = await realtimeReconciliationToken();
			if (request.headers.get("x-realtime-reconcile-token") !== expectedToken) {
				return new Response("forbidden", { status: 403 });
			}
			return this.reconcile(url.pathname.split("/").filter(Boolean).at(-1) ?? "");
		}
		if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
			return new Response("websocket required", { status: 426 });
		}
		if (this.client?.readyState === WebSocket.OPEN && !this.settled) {
			return new Response("realtime relay already connected", { status: 409 });
		}
		const sessionId = url.pathname.split("/").filter(Boolean).at(-2) ?? "";
		const { token, responseProtocol } = relayTokenFromRequest(request);
		if (!isRealtimeRelaySecret(token)) {
			return new Response("valid realtime relay token required", { status: 401 });
		}
		this.session = await claimRealtimeSessionForRelay({ sessionId, token });
		this.usage = (await this.state.storage.get<RelayUsageAggregate>(STORAGE_USAGE)) ?? {};
		this.providerState = (await this.state.storage.get<RelayProviderState>(STORAGE_PROVIDER_STATE)) ?? this.providerState;
		await this.state.storage.put({
			[STORAGE_SESSION_ID]: this.session.session_id,
			[STORAGE_PROVIDER_STATE]: this.providerState,
		});
		await this.scheduleExpiryAlarm();

		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);
		this.client = server;
		this.clientGoneHandled = false;
		server.accept();
		server.addEventListener("message", (event) => {
			this.state.waitUntil(this.handleClientMessage(event.data));
		});
		server.addEventListener("close", (event) => {
			this.replyToClientClose(server, event);
			this.state.waitUntil(this.handleClientGoneOnce(server, "client_socket_closed"));
		});
		server.addEventListener("error", () => {
			try {
				server.close(1011, "realtime_client_socket_error");
			} catch {
				// The browser socket may already be closing.
			}
			this.state.waitUntil(this.handleClientGoneOnce(server, "client_socket_error"));
		});

		try {
			await this.connectProvider();
			if (this.client !== server || this.clientGoneHandled) {
				// The client may have settled the session while the upstream handshake
				// was still in flight. Always close the socket that just connected;
				// settle() intentionally returns early for an already-settled session.
				this.closeUpstream("client_disconnected_during_provider_connection");
				await this.settle("cancelled", "client_disconnected_during_provider_connection");
			} else if (!this.isLive) {
				this.session = await markRealtimeSessionConnected({
					auth: authForSession(this.session, `realtime_relay:${this.session.session_id}`),
					sessionId: this.session.session_id,
				});
			}
		} catch (error) {
			await this.settle("failed", "realtime_provider_connection_failed");
			throw error;
		}
		if (!this.settled) {
			this.sendClient({
				type: "relay.connected",
				session_id: this.session.session_id,
				provider: this.session.provider,
			});
			this.resetIdleTimer();
		}

		return new Response(null, {
			status: 101,
			webSocket: client,
			headers: responseProtocol ? { "Sec-WebSocket-Protocol": responseProtocol } : undefined,
		});
	}

	private async connectProvider() {
		if (!this.session) throw new Error("realtime_relay_session_missing");
		const provider = providerFromSession(this.session);
		const model = this.session.provider_model_id ?? this.session.model_id.split("/").pop() ?? this.session.model_id;
		const voice = this.session.voice ?? undefined;
		const instructions =
			typeof metadataRecord(this.session).instructions === "string"
				? String(metadataRecord(this.session).instructions)
				: undefined;
		const thinkingLevel = metadataRecord(this.session).thinking_level;

		if (provider === "openai") {
			const key = resolveOpenAIKey();
			if (!key) throw new Error("openai_key_missing");
			if (this.isLive) {
				const start = liveStartEvent(liveConfig(this.session.metadata), voice ?? "marin", instructions);
				this.upstream = await connectWebSocket("wss://api.openai.com/v1/live/sessions",
					{ headers: await openAIRealtimeHeaders(key, this.session) });
				if (this.settled || this.clientGoneHandled) { this.closeUpstream("client_gone_before_live_start"); return; }
				this.attachUpstream();
				// Once start is sent, missing final usage must retain the hold, even if setup times out.
				this.usage.live_started = true;
				await this.checkpointUsage(true);
				if (this.clientGoneHandled || this.liveClosing || this.settled) {
					// The startup command has not been sent, so this connection cannot have billed Live usage.
					this.usage.live_started = false;
					await this.checkpointUsage(true);
					this.closeUpstream("client_gone_before_live_start");
					await this.settle("cancelled", "client_gone_before_live_start");
					return;
				}
				this.sendUpstream(start);
				return;
			}
			this.upstream = await connectWebSocket(
				`wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`,
				{ headers: await openAIRealtimeHeaders(key, this.session) },
			);
			this.attachUpstream();
			this.sendUpstream({
				type: "session.update",
				session: {
					type: "realtime",
					instructions,
					output_modalities: ["audio"],
					audio: {
						input: {
							format: { type: "audio/pcm", rate: OPENAI_INPUT_SAMPLE_RATE },
							turn_detection: { type: "server_vad" },
						},
						output: {
							format: { type: "audio/pcm", rate: OPENAI_INPUT_SAMPLE_RATE },
							voice,
						},
					},
				},
			});
			return;
		}

		if (provider === "google-ai-studio") {
			const key = resolveGoogleKey();
			if (!key) throw new Error("google_ai_studio_key_missing");
			this.upstream = await connectWebSocket(
				`${GOOGLE_LIVE_URL}?key=${encodeURIComponent(key)}`,
			);
			this.attachUpstream();
			this.sendUpstream({
				setup: buildGoogleBidiGenerateContentSetup({
					model,
					voice,
					instructions,
					thinkingLevel:
						thinkingLevel === "low" || thinkingLevel === "medium" || thinkingLevel === "high"
							? thinkingLevel
							: null,
				}),
			});
			return;
		}

		const key = resolveXAIKey();
		if (!key) throw new Error("xai_key_missing");
		this.upstream = await connectWebSocket(
			`wss://api.x.ai/v1/realtime?model=${encodeURIComponent(model)}`,
			{ headers: { Authorization: `Bearer ${key}` } },
		);
		// Server VAD sessions are billed for connected duration from this point.
		if (!this.usage.provider_connected_at_ms) this.usage.provider_connected_at_ms = Date.now();
		delete this.usage.provider_closed_at_ms;
		await this.checkpointUsage(true);
		this.attachUpstream();
		this.sendUpstream({
			type: "session.update",
			session: {
				voice: voice ?? "eve",
				instructions,
				turn_detection: { type: "server_vad" },
				audio: {
					input: { format: { type: "audio/pcm", rate: XAI_INPUT_SAMPLE_RATE } },
					output: { format: { type: "audio/pcm", rate: XAI_OUTPUT_SAMPLE_RATE } },
				},
			},
		});
	}

	private attachUpstream() {
		const upstream = this.upstream;
		if (!upstream) return;
		upstream.addEventListener("message", (event) => {
			this.queueUpstreamEvent(() => this.handleUpstreamMessage(event.data));
		});
		upstream.addEventListener("close", (event) => {
			this.queueUpstreamEvent(() => this.handleUpstreamClose(event));
		});
		upstream.addEventListener("error", () => {
			this.sendClient({
				type: "relay.upstream_error",
				provider: this.session?.provider,
			});
			this.closeUpstream("realtime_provider_socket_error");
			this.queueUpstreamEvent(async () => { await this.settle("failed", "provider_socket_error"); });
		});
	}

	private queueUpstreamEvent(handle: () => Promise<void>) {
		// A close must not settle while the preceding usage event is still being persisted.
		this.upstreamEvents = this.upstreamEvents.then(handle).catch(async (error) => {
			console.error("realtime_provider_event_failed", { sessionId: this.session?.session_id, error });
			if (this.isLive) {
				this.usage.live_billing_error = "provider_event_processing_failed";
				await this.checkpointUsage(true);
			}
			await this.settle("failed", "provider_event_processing_failed");
		});
		this.state.waitUntil(this.upstreamEvents);
	}

	private async handleUpstreamClose(event: CloseEvent) {
		if (this.settled) return;
		const provider = this.session ? providerFromSession(this.session) : null;
		const googleClosedBeforeSetup =
			provider === "google-ai-studio" && !this.providerSetupComplete;
		const closedBeforeReady = !this.providerEventSeen || googleClosedBeforeSetup;
		const reason = closedBeforeReady
			? "provider_socket_closed_before_setup"
			: "provider_socket_closed";
		this.sendClient({
			type: "relay.upstream_closed",
			provider: this.session?.provider,
			code: event.code,
			reason: event.reason,
			wasClean: event.wasClean,
			phase: closedBeforeReady ? "setup" : "session",
		});
		this.upstream = null;
		this.markProviderClosed();
		if (this.pendingSettlement) {
			// Already ending: the provider closing first means no more usage will arrive.
			await this.settle(this.pendingSettlementStatus(this.pendingSettlement), this.pendingSettlement.reason);
			return;
		}
		// An interrupted turn is settled from confirmed usage plus a metered estimate.
		await this.settle(
			closedBeforeReady || !this.providerCompletedResponseSeen
				? "failed"
				: this.budgetClosing
					? "expired"
					: "completed",
			this.budgetClosing && !closedBeforeReady
				? "realtime_budget_closed_provider_socket"
				: reason,
		);
	}

	private async handleClientMessage(raw: unknown) {
		const text = await parseMessageData(raw);
		if (!text || new TextEncoder().encode(text).byteLength > RELAY_MAX_MESSAGE_BYTES) {
			await this.rejectAudio("realtime_audio_message_too_large");
			return;
		}
		const message = parseJson(text) as ClientAudioMessage | null;
		this.lastActivityAt = Date.now();
		if (this.isLive && (message?.type as string) === "client.close") {
			await this.requestLiveClose("completed", "client_requested_close");
			return;
		}
		if (!message || message.type !== "client.audio" || !message.audio) return;
		const provider = this.session ? providerFromSession(this.session) : null;
		if (!provider || !this.acceptingAudio || !this.providerSetupComplete) return;
		if (!this.audioStartedAt) this.audioStartedAt = Date.now();
		const validated = validateRealtimeAudioIngress({
			base64: message.audio,
			sampleRate: inputSampleRate(provider),
			currentInputMs: this.receivedAudioMs,
			elapsedMs: Date.now() - this.audioStartedAt,
		});
		if ("reason" in validated) {
			await this.rejectAudio(validated.reason);
			return;
		}
		if (this.upstream?.readyState !== WebSocket.OPEN || this.upstream.bufferedAmount > RELAY_MAX_BUFFERED_BYTES) {
			await this.rejectAudio("realtime_upstream_backpressure");
			return;
		}
		// Ingress limits include dropped silence; billable usage must not.
		this.receivedAudioMs += validated.durationMs;
		if (this.isLive) {
			this.resetIdleTimer();
			this.sendUpstream({ type: "session.input_audio.append", audio: message.audio });
			return;
		}
		if (provider === "google-ai-studio") {
			// Compute activity from validated PCM, never the client-supplied rms.
			// Idle microphone silence does not create a provider VAD turn and
			// must not reopen pending billing after the last response.
			const pcm = atob(message.audio);
			let squares = 0;
			for (let i = 0; i < pcm.length; i += 2) {
				const value = pcm.charCodeAt(i) | (pcm.charCodeAt(i + 1) << 8);
				const sample = (value >= 32768 ? value - 65536 : value) / 32768;
				squares += sample * sample;
			}
			const speech = Math.sqrt(squares / (pcm.length / 2)) >= GOOGLE_SPEECH_RMS_THRESHOLD;
			if (speech) {
				this.googleAudioActive = true;
				this.googleSilenceMs = 0;
			} else {
				this.googleSilenceMs += validated.durationMs;
				if (!this.googleAudioActive || this.googleSilenceMs >= GOOGLE_SILENCE_END_MS) {
					if (this.googleAudioActive) this.sendUpstream({ realtimeInput: { audioStreamEnd: true } });
					this.googleAudioActive = false;
					return;
				}
			}
		}
		if (provider === "openai") {
			// Raw microphone duration is diagnostic; OpenAI bills committed tokens.
			this.usage.received_audio_ms = this.receivedAudioMs;
		} else {
			this.usage = addDuration(this.usage, "input_audio_ms", validated.durationMs);
		}
		const pendingBefore = this.inputSinceLastResponse;
		if (provider !== "spacex-ai") {
			this.usage.pending_input_audio_ms = toNumber(this.usage.pending_input_audio_ms) + validated.durationMs;
		}
		// OpenAI only bills audio once the provider commits it and creates a
		// response, so pending input is marked from provider events instead.
		// Google speech (RMS gated above) can start a provider VAD turn.
		if (provider === "google-ai-studio") {
			this.inputSinceLastResponse = true;
			this.usage.input_audio_pending = true;
		}
		this.resetIdleTimer();
		await this.checkpointUsage(!pendingBefore && this.inputSinceLastResponse);
		void this.maybePersistUsage();
		if (provider === "google-ai-studio") {
			this.sendUpstream({
				realtimeInput: {
					audio: {
						mimeType: "audio/pcm;rate=16000",
						data: message.audio,
					},
				},
			});
			return;
		}
		this.sendUpstream({
			type: "input_audio_buffer.append",
			audio: message.audio,
		});
	}

	private async rejectAudio(reason: string) {
		this.acceptingAudio = false;
		this.sendClient({ type: "relay.input_rejected", reason });
		// Use the same drain as other endings so in-flight usage is not lost.
		await this.forceAuthoritativeUsage("failed", reason);
	}

	private isBillingEvent(event: Record<string, unknown>): boolean {
		if (!this.session) return false;
		const type = getStringField(event, "type");
		if (this.isLive) return LIVE_BILLING_EVENT_TYPES.has(type);
		if (providerFromSession(this.session) === "google-ai-studio") {
			return Boolean(event.usageMetadata || event.serverContent);
		}
		return OPENAI_BILLING_EVENT_TYPES.has(type);
	}

	private async handleUpstreamMessage(raw: unknown) {
		const text = await parseMessageData(raw);
		if (!text) return;
		this.lastActivityAt = Date.now();
		// Bounds the billed duration of an xAI session if this object is evicted.
		if (this.upstream && this.usage.provider_connected_at_ms) this.usage.provider_last_seen_ms = this.lastActivityAt;
		const event = parseJson(text);
		let forwarded = false;
		const forward = () => {
			if (forwarded) return;
			forwarded = true;
			this.sendClientRaw(text);
		};
		// Usage-bearing and in-flight events are journaled to Durable Object
		// storage before the client sees them; everything else is forwarded first.
		if (!event || !this.session || !this.isBillingEvent(event)) forward();
		if (!event || !this.session) return;
		try {
			await this.processUpstreamEvent(event, forward);
		} finally {
			forward();
		}
	}

	private async processUpstreamEvent(event: Record<string, unknown>, forward: () => void) {
		if (!this.session) return;
		this.providerEventSeen = true;
		const provider = providerFromSession(this.session);
		const type = getStringField(event, "type");
		if (this.isLive) {
			this.usage = { ...this.usage, ...ingestLiveUsage(this.usage, event) };
			if (LIVE_BILLING_EVENT_TYPES.has(type)) await this.checkpointUsage(true);
			forward();
			if (type === "session.started") {
				this.providerSetupComplete = true;
				this.session = await markRealtimeSessionConnected({
					auth: authForSession(this.session, `live_started:${this.session.session_id}`), sessionId: this.session.session_id,
					providerSessionId: getStringField(getRecordField(event, "session") ?? {}, "id"),
				});
				if (this.liveClosing) this.sendUpstream({ type: "session.close" });
			}
			if (type === "error") { await this.requestLiveClose("failed", "live_provider_error"); return; }
			if (LIVE_BILLING_EVENT_TYPES.has(type)) {
				if (type !== "response.event" || getRecordField(event, "event")?.response
					|| getRecordField(event, "event")?.type === "response.output_item.done") {
					await this.persistUsage();
					const priced = priceLiveUsage(this.usage, liveConfig(this.session.metadata));
					this.sendClient({ type: "relay.live_usage", seconds: this.usage.live_seconds ?? 0,
						voice_nanos: priced.live_voice_nanos, backend_nanos: priced.live_backend_nanos,
						tool_nanos: priced.live_tool_nanos, usage: liveUsageMeters(this.usage),
						response_count: this.usage.live_responses?.length ?? 0,
						pending_response_count: this.usage.live_pending_responses?.length ?? 0 });
				}
			}
			if (this.usage.live_final && !this.usage.live_pending_responses?.length && !this.usage.live_tool_calls?.some((call) => !call.done)) {
				const pending = await this.state.storage.get<PendingSettlement>(STORAGE_PENDING_SETTLEMENT);
				await this.settle(pending?.status ?? "completed", pending?.reason ?? "live_session_closed");
			}
			return;
		}
		if (type === "session.updated" || event.setupComplete) this.providerSetupComplete = true;
		if (event.error && !this.providerSetupComplete) {
			forward();
			await this.settle("failed", "provider_session_setup_failed");
			return;
		}
		const flagsBefore = this.billingFlagsKey();
		const providerStateBefore = provider === "google-ai-studio" ? JSON.stringify(this.providerState) : "";
		let completedTurn: { usage: Record<string, unknown>; responseId: string | null } | null = null;
		let inputCleared = false;

		if (provider === "openai") {
			if (type === "input_audio_buffer.speech_started") {
				this.openAISpeechActive = true;
				const start = event.audio_start_ms;
				this.openAISpeechStartMs = typeof start === "number" && Number.isFinite(start) ? start : null;
			}
			if (type === "input_audio_buffer.speech_stopped") {
				this.openAISpeechActive = false;
				const end = event.audio_end_ms;
				if (this.openAISpeechStartMs != null && typeof end === "number" && Number.isFinite(end)) {
					this.usage.pending_vad_input_audio_ms = toNumber(this.usage.pending_vad_input_audio_ms)
						+ Math.max(0, end - this.openAISpeechStartMs) + OPENAI_VAD_PREFIX_PADDING_MS;
				}
				this.openAISpeechStartMs = null;
			}
			// OpenAI bills input once it is committed and a response is created;
			// uncommitted microphone audio is never pending billing.
			if (type === "input_audio_buffer.committed") {
				this.openAIInputCommitted = true;
				this.inputSinceLastResponse = true;
				this.usage.input_audio_pending = true;
			}
			if (type === "response.created") {
				this.openAIInputCommitted = false;
				this.inputSinceLastResponse = true;
				this.usage.input_audio_pending = true;
				if (this.cancelResponsesOnDrain) this.sendUpstream({ type: "response.cancel" });
			}
			if (type === "input_audio_buffer.cleared" && this.waitingForOpenAIInputClear) {
				this.waitingForOpenAIInputClear = false;
				delete this.usage.input_audio_clear_pending;
				this.openAISpeechActive = false;
				inputCleared = true;
			}
			if (type === "response.output_audio.delta") {
				this.usage.pending_output_audio_ms = toNumber(this.usage.pending_output_audio_ms)
					+ pcm16Base64DurationMs(getStringField(event, "delta"), OPENAI_OUTPUT_SAMPLE_RATE);
			}
		}

		if (
			type === "response.created" ||
			type === "response.output_item.added" ||
			type === "response.content_part.added" ||
			type === "response.output_audio.delta"
		) {
			this.markResponseInFlight();
		}

		if (type === "response.output_audio.delta" && provider === "spacex-ai") {
			this.usage = addDuration(
				this.usage,
				"output_audio_ms",
				pcm16Base64DurationMs(getStringField(event, "delta"), XAI_OUTPUT_SAMPLE_RATE),
			);
		}

		if (type === "response.done") {
			const response = getRecordField(event, "response");
			const responseId = response ? getStringField(response, "id") : "";
			const usage = response ? getRecordField(response, "usage") : null;
			const hasUsage = Boolean(usage && Object.keys(usage).length > 0);
			const duplicate = Boolean(responseId && this.providerState.seenResponseIds.includes(responseId));
			if (!duplicate) {
				if (hasUsage && usage) {
					this.usage = addOpenAIUsage(this.usage, usage);
					if (provider === "spacex-ai") {
						const costTicks = toNumber(usage.cost_in_usd_ticks ?? usage.costInUsdTicks);
						if (costTicks > 0) {
							this.usage.provider_cost_usd_ticks =
								toNumber(this.usage.provider_cost_usd_ticks) + costTicks;
							this.usage.provider_cost_nanos = Math.round(
								toNumber(this.usage.provider_cost_usd_ticks) / 10,
							);
						}
					}
				} else if (provider === "openai") {
					// A terminal event without usage still ends the turn: settle it
					// from metered audio instead of leaving it in flight forever.
					this.applyPendingEstimate("openai_response_usage_missing");
				}
				if (responseId) {
					this.providerState.seenResponseIds = [
						...this.providerState.seenResponseIds.slice(-255),
						responseId,
					];
				}
			}
			this.providerCompletedResponseSeen = true;
			this.clearResponseState();
			completedTurn = { usage: usage ?? {}, responseId: responseId || null };
			if (responseId && !duplicate) await this.persistProviderState();
		}

		if (type === "response.output_audio.done" && provider === "spacex-ai") {
			const first = !this.providerCompletedResponseSeen;
			this.providerCompletedResponseSeen = true;
			this.clearResponseState();
			completedTurn = first ? { usage: {}, responseId: null } : { usage: {}, responseId: "" };
		}

		if (provider === "google-ai-studio") {
			if (event.setupComplete) this.providerSetupComplete = true;
			const serverContent = getRecordField(event, "serverContent");
			if (serverContent) {
				const interactionStatus =
					getStringField(serverContent, "interactionStatus") ||
					getStringField(event, "interactionStatus");
				const modelTurn = getRecordField(serverContent, "modelTurn");
				const parts = modelTurn ? getArrayField<Record<string, unknown>>(modelTurn, "parts") : [];
				for (const part of parts) {
					const inlineData = getRecordField(part, "inlineData");
					if (inlineData || getStringField(part, "text")) {
						this.beginGoogleTurn();
						this.markResponseInFlight();
					}
					if (inlineData && getStringField(inlineData, "mimeType").startsWith("audio/")) {
						this.usage.pending_output_audio_ms = toNumber(this.usage.pending_output_audio_ms)
							+ pcm16Base64DurationMs(getStringField(inlineData, "data"), GOOGLE_OUTPUT_SAMPLE_RATE);
					}
				}
				// generationComplete precedes turnComplete (and interrupted also has a
				// following turnComplete). Only the latter closes the usage accumulator.
				if (serverContent.turnComplete && interactionStatus !== "IN_PROGRESS") {
					this.beginGoogleTurn();
					this.providerState.googleTurnComplete = true;
				}
			}
			const usageMetadata = getRecordField(event, "usageMetadata");
			if (usageMetadata) {
				this.beginGoogleTurn();
				this.providerState.googleTurnUsage = mergeGoogleUsageSnapshot(
					this.providerState.googleTurnUsage,
					googleUsageSnapshot(usageMetadata),
				);
			}
			const turnUsage = this.takeCompletedGoogleTurn();
			if (turnUsage) completedTurn = { usage: turnUsage, responseId: null };
		}

		// Journal before forwarding: a crash after the client saw this event
		// must not lose the usage or in-flight state it implies.
		const flagsChanged = flagsBefore !== this.billingFlagsKey();
		await this.checkpointUsage(flagsChanged || completedTurn != null);
		if (provider === "google-ai-studio" && providerStateBefore !== JSON.stringify(this.providerState)) {
			await this.persistProviderState();
		}
		forward();

		if (type === "response.output_audio.delta" && provider === "spacex-ai") void this.maybePersistUsage();
		if (completedTurn) {
			await this.persistUsage();
			if (completedTurn.responseId !== "") {
				await this.emitTurnTelemetry(completedTurn.usage, completedTurn.responseId);
			}
			await this.afterResponseComplete();
		}
		if (inputCleared) await this.finishDrainIfIdle();
	}

	private billingFlagsKey(): string {
		return `${this.responseInFlight}|${this.inputSinceLastResponse}|${this.providerState.googleTurnActive}|${this.waitingForOpenAIInputClear}`;
	}

	private beginGoogleTurn() {
		if (this.providerState.googleTurnActive) return;
		this.providerState.googleTurnActive = true;
		this.providerState.googleTurnComplete = false;
		this.providerState.googleTurnUsage = {};
	}

	private takeCompletedGoogleTurn(): RelayUsageAggregate | null {
		if (!this.providerState.googleTurnActive || !this.providerState.googleTurnComplete) return null;
		const turnUsage = this.providerState.googleTurnUsage;
		const hasUsage =
			toNumber(turnUsage.input_text_tokens) +
			toNumber(turnUsage.input_audio_tokens) +
			toNumber(turnUsage.input_image_tokens) +
			toNumber(turnUsage.input_video_tokens) +
			toNumber(turnUsage.output_text_tokens) +
			toNumber(turnUsage.output_audio_tokens) > 0;
		if (!hasUsage) return null;
		this.usage = addTokenUsage(this.usage, turnUsage);
		this.providerState.googleTurnActive = false;
		this.providerState.googleTurnComplete = false;
		this.providerState.googleTurnUsage = {};
		this.providerCompletedResponseSeen = true;
		this.clearResponseState();
		return turnUsage;
	}

	private markResponseInFlight() {
		if (!this.responseInFlight) this.turnStartedAtMs = Date.now();
		this.responseInFlight = true;
		this.usage.assistant_response_in_flight = true;
	}

	private hasPendingBilling(): boolean {
		if (!this.session || providerFromSession(this.session) === "spacex-ai") return false;
		return this.responseInFlight || this.inputSinceLastResponse || this.providerState.googleTurnActive;
	}

	/**
	 * Converts a turn whose provider usage never arrived into estimated token
	 * meters from metered audio, so the session settles instead of waiting for
	 * manual review. Returns false when nothing was pending.
	 */
	private applyPendingEstimate(basis: string): boolean {
		if (!this.session || !this.hasPendingBilling()) return false;
		const provider = providerFromSession(this.session) as "openai" | "google-ai-studio";
		const rates = REALTIME_ESTIMATE_AUDIO_TOKENS_PER_SECOND[provider] ?? REALTIME_ESTIMATE_AUDIO_TOKENS_PER_SECOND.openai;
		const googleTurn = provider === "google-ai-studio" && this.providerState.googleTurnActive
			? this.providerState.googleTurnUsage
			: {};
		let inputMs = 0;
		if (provider === "openai") {
			const vadMs = toNumber(this.usage.pending_vad_input_audio_ms);
			if (this.inputSinceLastResponse || this.responseInFlight) {
				inputMs = vadMs > 0 ? vadMs : toNumber(this.usage.pending_input_audio_ms);
			}
		} else if (this.providerState.googleTurnActive || this.responseInFlight) {
			// Speech that no model turn followed is not billed by Google.
			inputMs = toNumber(this.usage.pending_input_audio_ms);
		}
		const outputMs = toNumber(this.usage.pending_output_audio_ms);
		const estimate: RelayUsageAggregate = {
			input_text_tokens: toNumber(googleTurn.input_text_tokens),
			output_text_tokens: toNumber(googleTurn.output_text_tokens),
			input_audio_tokens: Math.max(toNumber(googleTurn.input_audio_tokens), Math.ceil((inputMs / 1000) * rates.input)),
			output_audio_tokens: Math.max(toNumber(googleTurn.output_audio_tokens), Math.ceil((outputMs / 1000) * rates.output)),
		};
		this.usage = addTokenUsage(this.usage, estimate);
		this.usage.estimated_input_audio_tokens =
			toNumber(this.usage.estimated_input_audio_tokens) + toNumber(estimate.input_audio_tokens);
		this.usage.estimated_output_audio_tokens =
			toNumber(this.usage.estimated_output_audio_tokens) + toNumber(estimate.output_audio_tokens);
		this.usage.billing_estimated = true;
		this.usage.estimate_basis = this.usage.estimate_basis && this.usage.estimate_basis !== basis
			? "mixed"
			: basis;
		this.providerState.googleTurnActive = false;
		this.providerState.googleTurnComplete = false;
		this.providerState.googleTurnUsage = {};
		this.clearResponseState(true);
		return true;
	}

	private clearResponseState(force = false) {
		this.responseInFlight = false;
		// A commit after this response was created is still awaiting its own response.
		const committedAfter = !force && this.openAIInputCommitted;
		this.openAIInputCommitted = committedAfter;
		this.inputSinceLastResponse = committedAfter;
		delete this.usage.assistant_response_in_flight;
		if (!committedAfter) {
			delete this.usage.input_audio_pending;
			delete this.usage.pending_input_audio_ms;
			delete this.usage.pending_vad_input_audio_ms;
		}
		delete this.usage.pending_output_audio_ms;
	}

	private async emitTurnTelemetry(usage: Record<string, unknown>, responseId: string | null) {
		if (!this.session) return;
		const turnId = responseId ?? `${this.session.session_id}:${crypto.randomUUID()}`;
		await enqueueAsyncGenAiOtlpExport({
			requestId: `realtime-turn:${turnId}`,
			workspaceId: this.session.workspace_id,
			keyId: this.session.key_id,
			userId: this.session.user_id,
			operation: "realtime",
			phase: "turn",
			endpoint: "audio.realtime",
			model: this.session.model_id,
			provider: this.session.provider,
			providerModel: this.session.provider_model_id,
			sessionId: this.session.session_id,
			startedAtMs: this.turnStartedAtMs || Date.now(),
			completedAtMs: Date.now(),
			success: true,
			usage,
			traceContext: realtimeOtelContext(this.session),
		}).catch((error) => console.error("realtime_otel_turn_failed", {
			sessionId: this.session?.session_id,
			error: error instanceof Error ? error.message : String(error),
		}));
	}

	private async afterResponseComplete() {
		if (this.pendingSettlement) {
			await this.finishDrainIfIdle();
			return;
		}
		if (!this.client && !this.waitingForOpenAIInputClear && !this.hasPendingBilling()) {
			await this.settle("completed", "client_disconnected_after_response");
		}
	}

	private pendingSettlementStatus(pending: PendingSettlement): PendingSettlement["status"] {
		if (!pending.statusFromResponses) return pending.status;
		return this.providerCompletedResponseSeen ? "completed" : "cancelled";
	}

	private async finishDrainIfIdle() {
		const pending = this.pendingSettlement;
		if (!pending || this.settled || this.settling) return;
		if (this.hasPendingBilling() || this.waitingForOpenAIInputClear) return;
		await this.settle(this.pendingSettlementStatus(pending), pending.reason);
	}

	private async setPendingSettlement(pending: PendingSettlement, timeoutMs: number) {
		this.pendingSettlement = pending;
		await this.state.storage.put(STORAGE_PENDING_SETTLEMENT, pending);
		await this.state.storage.setAlarm(Date.now() + timeoutMs);
	}

	private async handleClientGone() {
		this.acceptingAudio = false;
		if (this.isLive) { await this.requestLiveClose("cancelled", "client_disconnected"); return; }
		const provider = this.session ? providerFromSession(this.session) : null;
		if (provider === "openai" && this.receivedAudioMs > 0 && this.upstream?.readyState === WebSocket.OPEN) {
			// Uncommitted audio is not billed: discard it rather than committing it
			// and creating a reply nobody will hear. The acknowledgement orders any
			// commit the provider already made ahead of the settlement.
			this.waitingForOpenAIInputClear = true;
			this.usage.input_audio_clear_pending = true;
			this.sendUpstream({ type: "input_audio_buffer.clear" });
		}
		await this.forceAuthoritativeUsage(
			this.providerCompletedResponseSeen ? "completed" : "cancelled",
			"client_disconnected",
			{ statusFromResponses: true },
		);
	}

	/**
	 * Ends the session: cancels an in-flight response (OpenAI) or ends the
	 * microphone stream (Google), waits briefly for the provider's final usage
	 * event, then settles. Never creates a new billed response.
	 */
	private async forceAuthoritativeUsage(
		status: "completed" | "failed" | "cancelled" | "expired",
		reason: string,
		options?: { statusFromResponses?: boolean },
	) {
		if (!this.session || this.settled || this.settling) return;
		this.acceptingAudio = false;
		if (this.isLive) { await this.requestLiveClose(status, reason); return; }
		if (this.pendingSettlement?.phase === "authoritative") return;
		const provider = providerFromSession(this.session);
		this.cancelResponsesOnDrain = true;
		if (
			provider === "spacex-ai" ||
			(!this.hasPendingBilling() && !this.waitingForOpenAIInputClear) ||
			this.upstream?.readyState !== WebSocket.OPEN
		) {
			await this.settle(status, reason);
			return;
		}

		if (provider === "openai") {
			if (this.responseInFlight) this.sendUpstream({ type: "response.cancel" });
		} else if (provider === "google-ai-studio") {
			this.sendUpstream({ realtimeInput: { audioStreamEnd: true } });
		}
		await this.checkpointUsage(true);
		await this.setPendingSettlement({
			status,
			reason,
			phase: "authoritative",
			...(options?.statusFromResponses ? { statusFromResponses: true } : {}),
		}, RELAY_AUTHORITATIVE_USAGE_TIMEOUT_MS);
		if (this.drainTimer != null) clearTimeout(this.drainTimer);
		this.drainTimer = setTimeout(() => {
			this.drainTimer = null;
			const pending = this.pendingSettlement;
			void this.settle(pending ? this.pendingSettlementStatus(pending) : status, `${reason}_authoritative_usage_timeout`);
		}, RELAY_AUTHORITATIVE_USAGE_TIMEOUT_MS) as unknown as number;
	}

	private async maybePersistUsage() {
		const now = Date.now();
		if (now - this.lastUsagePersistAt < RELAY_USAGE_PERSIST_INTERVAL_MS) return;
		this.lastUsagePersistAt = now;
		await this.persistUsage();
	}

	private async checkpointUsage(force = false) {
		if (this.settled) return;
		const now = Date.now();
		if (!force && now - this.lastUsageCheckpointAt < RELAY_USAGE_CHECKPOINT_INTERVAL_MS) return;
		this.lastUsageCheckpointAt = now;
		await this.state.storage.put(STORAGE_USAGE, this.usage);
	}

	private async persistProviderState() {
		await this.state.storage.put(STORAGE_PROVIDER_STATE, this.providerState);
	}

	private markProviderClosed() {
		if (this.usage.provider_connected_at_ms && !this.usage.provider_closed_at_ms) {
			this.usage.provider_closed_at_ms = Date.now();
		}
	}

	/**
	 * xAI bills server VAD sessions for connected duration, not for the audio
	 * sent and received, so the billed audio meter is the provider wall clock.
	 */
	private refreshProviderSessionDuration() {
		if (!this.session || providerFromSession(this.session) !== "spacex-ai") return;
		const startedAt = toNumber(this.usage.provider_connected_at_ms);
		if (startedAt <= 0) return;
		const endedAt = toNumber(this.usage.provider_closed_at_ms)
			|| (this.upstream?.readyState === WebSocket.OPEN
				? Date.now()
				: toNumber(this.usage.provider_last_seen_ms) || Date.now());
		this.usage.session_audio_ms = Math.max(0, endedAt - startedAt);
		this.usage.audio_ms = this.usage.session_audio_ms;
	}

	private async persistUsage() {
		if (!this.session || this.settled) return;
		this.lastUsagePersistAt = Date.now();
		this.refreshProviderSessionDuration();
		await this.checkpointUsage(true);
		const updated = await updateRealtimeSessionUsage({
			auth: authForSession(this.session, `realtime_relay_usage:${this.session.session_id}`),
			sessionId: this.session.session_id,
			usage: this.usage,
		}).catch((error) => {
			console.error("realtime_relay_usage_failed", error);
			return null;
		});
		if (!updated) {
			if (this.isLive) await this.requestLiveClose("failed", "live_billing_checkpoint_failed");
			return;
		}
		this.session = updated;
		if (["completed", "failed", "cancelled", "expired"].includes(updated.status)) {
			this.acceptingAudio = false;
			this.closeSockets("realtime_session_terminal");
			return;
		}
		if (updated.status === "ending") {
			await this.beginBudgetClose(updated.disconnect_reason ?? "realtime_policy_limit_reached");
			return;
		}
		await this.enforceBudget(updated);
	}

	private async enforceBudget(session: RealtimeSessionRow) {
		if (this.budgetClosing || this.settled) return;
		const decision = decideRealtimeRelayBudget({
			reservedNanos: Number(session.reserved_nanos ?? 0) || 0,
			estimatedCostNanos: Number(session.estimated_cost_nanos ?? 0) || 0,
		});
		if (decision.action !== "extend" || decision.targetReservedNanos == null) return;
		try {
			this.session = await extendRealtimeSessionHold({
				auth: authForSession(session, `realtime_relay_extend:${session.session_id}`),
				sessionId: session.session_id,
				targetReservedNanos: decision.targetReservedNanos,
				estimatedCostNanos: session.estimated_cost_nanos,
			});
			this.sendClient({
				type: "relay.hold_extended",
				reserved_nanos: this.session.reserved_nanos,
				estimated_cost_nanos: this.session.estimated_cost_nanos,
			});
		} catch (error) {
			console.error("realtime_relay_hold_extend_failed", error);
			await this.beginBudgetClose(
				decision.ratio >= REALTIME_GRACEFUL_STOP_THRESHOLD
					? "realtime_budget_threshold"
					: "realtime_credit_hold_extension_failed",
			);
		}
	}

	private async beginBudgetClose(reason: string) {
		if (this.budgetClosing || this.settled) return;
		this.budgetClosing = true;
		this.acceptingAudio = false;
		this.sendClient({ type: "relay.budget_closing", reason });
		if (this.isLive) { await this.requestLiveClose("expired", reason); return; }
		// Never start an extra billed closing response. A response already in
		// progress may finish within the drain window; otherwise settle now.
		if (!this.hasPendingBilling()) {
			await this.settle("expired", reason);
			return;
		}
		if (this.drainTimer != null) clearTimeout(this.drainTimer);
		await this.setPendingSettlement({ status: "expired", reason, phase: "drain" }, RELAY_DRAIN_TIMEOUT_MS);
		this.drainTimer = setTimeout(() => {
			this.drainTimer = null;
			void this.forceAuthoritativeUsage("expired", reason);
		}, RELAY_DRAIN_TIMEOUT_MS) as unknown as number;
	}

	private async scheduleExpiryAlarm() {
		if (!this.session) return;
		const expiresAt = this.session.expires_at ? Date.parse(this.session.expires_at) : 0;
		const fallbackAt = Date.now() + REALTIME_MAX_DURATION_SECONDS * 1000;
		await this.state.storage.setAlarm(
			Number.isFinite(expiresAt) && expiresAt > 0 ? Math.min(Math.max(Date.now(), expiresAt), fallbackAt) : fallbackAt,
		);
	}

	private clearTimers() {
		if (this.drainTimer != null) {
			clearTimeout(this.drainTimer);
			this.drainTimer = null;
		}
		if (this.idleTimer != null) {
			clearTimeout(this.idleTimer);
			this.idleTimer = null;
		}
	}

	private resetIdleTimer() {
		if (this.idleTimer != null) clearTimeout(this.idleTimer);
		this.idleTimer = setTimeout(() => {
			this.idleTimer = null;
			this.acceptingAudio = false;
			void this.forceAuthoritativeUsage("expired", "realtime_idle_timeout");
		}, REALTIME_IDLE_TIMEOUT_SECONDS * 1_000) as unknown as number;
	}

	private replyToClientClose(socket: WebSocket, event: CloseEvent) {
		try {
			socket.close(event.code || 1000, event.reason);
		} catch {
			// The compatibility flag may already have completed the close handshake.
		}
	}

	private async handleClientGoneOnce(socket: WebSocket, reason: string) {
		if (this.client !== socket || this.clientGoneHandled) return;
		this.clientGoneHandled = true;
		this.client = null;
		if (this.idleTimer != null) {
			clearTimeout(this.idleTimer);
			this.idleTimer = null;
		}
		console.info("realtime_relay_client_gone", {
			sessionId: this.session?.session_id,
			reason,
		});
		await this.handleClientGone();
	}

	private async settle(status: "completed" | "failed" | "cancelled" | "expired", reason: string): Promise<boolean> {
		if (!this.session || this.settled) return this.settled;
		if (this.settling) return false;
		if (this.isLive) {
			try { assertLiveFinalUsage(this.usage); }
			catch {
				const needsDrain = this.usage.live_started && (!this.usage.live_final
					|| this.usage.live_pending_responses?.length
					|| this.usage.live_tool_calls?.some((call) => !call.done));
				// A complete but invalid snapshot cannot be repaired by closing again.
				// Avoid recursing through requestLiveClose() back into settlement.
				if (needsDrain && this.upstream?.readyState === WebSocket.OPEN && !this.liveClosing) {
					await this.requestLiveClose(status, reason); return false;
				}
				return this.markBillingUnresolved("live_authoritative_usage_pending");
			}
		}
		const provider = providerFromSession(this.session);
		this.settling = true;
		this.acceptingAudio = false;
		this.clearTimers();
		// Settle confirmed usage plus a metered estimate for any turn whose
		// provider usage never arrived, instead of opening a billing review.
		this.applyPendingEstimate("interrupted_turn_metered_audio");
		this.waitingForOpenAIInputClear = false;
		delete this.usage.input_audio_clear_pending;
		this.markProviderClosed();
		this.refreshProviderSessionDuration();
		const pending: PendingSettlement = { status, reason, phase: "settle" };
		this.pendingSettlement = pending;
		await this.state.storage.put({
			[STORAGE_SESSION_ID]: this.session.session_id,
			[STORAGE_USAGE]: this.usage,
			[STORAGE_PENDING_SETTLEMENT]: pending,
			[STORAGE_PROVIDER_STATE]: this.providerState,
		});
		this.closeUpstream("realtime_relay_settling");
		// xAI's reported cost can raise the bill above connected-time pricing but
		// never lower it: server-VAD sessions are billed for their full duration.
		const providerCostNanos = provider === "spacex-ai" ? toNumber(this.usage.provider_cost_nanos) : 0;
		try {
			await settleRealtimeSession({
				auth: authForSession(this.session, `realtime_relay_settle:${this.session.session_id}`),
				sessionId: this.session.session_id,
				status,
				usage: this.usage,
				...(providerCostNanos > 0 ? { providerCostNanos } : {}),
				disconnectReason: reason,
				estimated: this.usage.billing_estimated === true,
				estimateBasis: this.usage.estimate_basis ?? null,
			});
			this.settled = true;
			// Successful sessions have no Durable Object state worth retaining.
			// Clearing all storage also lets Cloudflare clean up the stored object.
			await this.state.storage.deleteAll();
			await this.state.storage.deleteAlarm();
			console.info("realtime_relay_settled", {
				sessionId: this.session.session_id,
				status,
				reason,
				estimated: this.usage.billing_estimated === true,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (message.includes("authoritative_usage") || message.includes("usage_missing_token_meters")) {
				this.settling = false;
				return this.markBillingUnresolved(reason);
			}
			console.error("realtime_relay_settle_failed", error);
			const attempts = ((await this.state.storage.get<number>(STORAGE_SETTLEMENT_ATTEMPTS)) ?? 0) + 1;
			this.settling = false;
			if (attempts >= RELAY_SETTLEMENT_MAX_ATTEMPTS) {
				return this.markBillingUnresolved("realtime_settlement_retry_exhausted");
			}
			await this.state.storage.put(STORAGE_SETTLEMENT_ATTEMPTS, attempts);
			await this.state.storage.setAlarm(Date.now() + RELAY_SETTLEMENT_RETRY_MS);
			return false;
		}
		this.settling = false;
		this.closeSockets("realtime_relay_settled");
		return true;
	}

	private async markBillingUnresolved(reason: string): Promise<boolean> {
		if (!this.session) return false;
		this.acceptingAudio = false;
		this.clearTimers();
		await this.state.storage.put({
			[STORAGE_SESSION_ID]: this.session.session_id,
			[STORAGE_USAGE]: this.usage,
			[STORAGE_PROVIDER_STATE]: this.providerState,
		});
		this.closeUpstream("realtime_billing_unresolved");
		try {
			this.session = await markRealtimeSessionBillingUnresolved({
				auth: authForSession(this.session, `realtime_relay_unresolved:${this.session.session_id}`),
				sessionId: this.session.session_id,
				usage: {
					...this.usage,
					assistant_response_in_flight: true,
					recovery_provider_state: this.providerState,
				},
				reason,
				session: this.session,
			});
			this.settled = true;
			// The authoritative unresolved record now lives in Supabase and this
			// terminal session is not retried through the Durable Object.
			await this.state.storage.deleteAll();
			await this.state.storage.deleteAlarm();
			this.closeSockets("realtime_billing_unresolved");
			console.error("realtime_relay_billing_unresolved", {
				sessionId: this.session.session_id,
				workspaceId: this.session.workspace_id,
				provider: this.session.provider,
				reason,
			});
			return true;
		} catch (error) {
			console.error("realtime_relay_mark_unresolved_failed", error);
			await this.state.storage.setAlarm(Date.now() + RELAY_SETTLEMENT_RETRY_MS);
			return false;
		}
	}

	/**
	 * Loads persisted state after an eviction. A live object keeps its newer
	 * in-memory state: storage checkpoints are throttled and may be older.
	 */
	private async restoreStateIfEvicted(sessionId: string) {
		const inMemory = this.session?.session_id === sessionId
			&& (Object.keys(this.usage).length > 0 || this.upstream != null || this.client != null);
		if (inMemory) return;
		this.session = await getRealtimeSessionForInternal(sessionId);
		this.usage = (await this.state.storage.get<RelayUsageAggregate>(STORAGE_USAGE)) ?? this.session.usage ?? {};
		this.providerState = (await this.state.storage.get<RelayProviderState>(STORAGE_PROVIDER_STATE)) ?? this.providerState;
		this.responseInFlight = this.usage.assistant_response_in_flight === true;
		this.inputSinceLastResponse = this.usage.input_audio_pending === true;
		this.waitingForOpenAIInputClear = this.usage.input_audio_clear_pending === true;
		this.pendingSettlement = (await this.state.storage.get<PendingSettlement>(STORAGE_PENDING_SETTLEMENT)) ?? null;
	}

	async alarm() {
		const sessionId = await this.state.storage.get<string>(STORAGE_SESSION_ID);
		if (!sessionId) return;
		// Every alarm ends the session (expiry, drain backup, settlement retry):
		// stop accepting audio before anything else.
		this.acceptingAudio = false;
		await this.restoreStateIfEvicted(sessionId);
		const pending = this.pendingSettlement
			?? (await this.state.storage.get<PendingSettlement>(STORAGE_PENDING_SETTLEMENT))
			?? null;
		if (pending?.phase === "drain") {
			this.pendingSettlement = null;
			await this.forceAuthoritativeUsage(pending.status, pending.reason, { statusFromResponses: pending.statusFromResponses });
			return;
		}
		if (!pending && (this.hasPendingBilling() || this.waitingForOpenAIInputClear)) {
			await this.forceAuthoritativeUsage("expired", "realtime_max_duration");
			return;
		}
		await this.settle(
			pending ? this.pendingSettlementStatus(pending) : "expired",
			pending?.reason ?? "realtime_max_duration",
		);
	}

	private isHealthy(): boolean {
		return !this.settled
			&& !this.settling
			&& !this.pendingSettlement
			&& this.client?.readyState === WebSocket.OPEN
			&& this.upstream?.readyState === WebSocket.OPEN
			&& Date.now() - this.lastActivityAt < REALTIME_IDLE_TIMEOUT_SECONDS * 1_000;
	}

	private async reconcile(sessionId: string): Promise<Response> {
		const storedSessionId = await this.state.storage.get<string>(STORAGE_SESSION_ID);
		if (!storedSessionId || storedSessionId !== sessionId) {
			return Response.json({ active: false, settled: false });
		}
		// A connected session with recent traffic is not stuck: leave it alone.
		if (this.session?.session_id === sessionId && this.isHealthy()) {
			return Response.json({ active: true, settled: false, healthy: true });
		}
		this.acceptingAudio = false;
		await this.restoreStateIfEvicted(sessionId);
		const pending = this.pendingSettlement
			?? (await this.state.storage.get<PendingSettlement>(STORAGE_PENDING_SETTLEMENT))
			?? null;
		if (pending?.phase === "authoritative" && this.upstream?.readyState === WebSocket.OPEN) {
			// Still inside its bounded wait for final usage.
			return Response.json({ active: true, settled: false, healthy: true });
		}
		const needsAuthoritativeDrain = this.hasPendingBilling() || this.waitingForOpenAIInputClear;
		if (pending?.phase === "drain" || (!pending && needsAuthoritativeDrain)) {
			this.pendingSettlement = null;
			await this.forceAuthoritativeUsage(
				pending?.status ?? "expired",
				pending?.reason ?? "realtime_session_reconciliation_expired",
				{ statusFromResponses: pending?.statusFromResponses },
			);
		} else {
			await this.settle(
				pending ? this.pendingSettlementStatus(pending) : "expired",
				pending?.reason ?? "realtime_session_reconciliation_expired",
			);
		}
		const settled = this.settled;
		return Response.json({ active: true, settled }, { status: settled ? 200 : 503 });
	}

	private closeUpstream(reason: string) {
		this.markProviderClosed();
		try {
			this.upstream?.close(1000, reason);
		} catch {
			// The provider socket may already be closed.
		}
		this.upstream = null;
	}

	private async requestLiveClose(status: PendingSettlement["status"], reason: string) {
		if (this.settled || this.liveClosing) return;
		if (!this.usage.live_started || (this.usage.live_final && !this.usage.live_pending_responses?.length && !this.usage.live_tool_calls?.some((call) => !call.done))) {
			await this.settle(status, reason); return;
		}
		if (this.upstream?.readyState !== WebSocket.OPEN) {
			await this.markBillingUnresolved("live_socket_closed_without_final_usage"); return;
		}
		this.liveClosing = true;
		this.acceptingAudio = false;
		this.clearTimers();
		await this.state.storage.put(STORAGE_PENDING_SETTLEMENT, { status, reason, phase: "authoritative" } satisfies PendingSettlement);
		await this.checkpointUsage(true);
		await this.state.storage.setAlarm(Date.now() + RELAY_DRAIN_TIMEOUT_MS);
		if (this.providerSetupComplete) this.sendUpstream({ type: "session.close" });
		this.drainTimer = setTimeout(() => {
			this.queueUpstreamEvent(async () => { await this.settle(status, "live_final_usage_timeout"); });
		}, RELAY_DRAIN_TIMEOUT_MS) as unknown as number;
	}

	private closeSockets(reason: string) {
		this.closeUpstream(reason);
		try {
			this.client?.close(1000, reason);
		} catch {
			// The browser socket may already be closed.
		}
		this.client = null;
	}

	private sendUpstream(payload: unknown) {
		if (this.upstream?.readyState !== WebSocket.OPEN) return;
		this.upstream.send(JSON.stringify(payload));
	}

	private sendClient(payload: unknown) {
		this.sendClientRaw(JSON.stringify(payload));
	}

	private sendClientRaw(payload: string) {
		if (this.client?.readyState !== WebSocket.OPEN) return;
		if (this.client.bufferedAmount > RELAY_MAX_BUFFERED_BYTES) {
			try {
				this.client.close(1009, "realtime_client_backpressure");
			} catch {
				// The browser socket may already be closing.
			}
			return;
		}
		this.client.send(payload);
	}
}
