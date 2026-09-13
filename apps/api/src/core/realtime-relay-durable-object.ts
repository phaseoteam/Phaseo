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
const RELAY_PROVIDER_STATE_PERSIST_INTERVAL_MS = 1_000;
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
const GOOGLE_SPEECH_RMS_THRESHOLD = 0.012;
const GOOGLE_SILENCE_END_MS = 1_000;
const BUDGET_CLOSING_INSTRUCTIONS =
	"The realtime session budget is almost exhausted. Briefly tell the user that this voice session is ending, finish the current thought, and do not ask a follow-up question.";

type RelayUsageAggregate = LiveUsage & {
	input_text_tokens?: number;
	output_text_tokens?: number;
	input_audio_tokens?: number;
	output_audio_tokens?: number;
	cached_read_text_tokens?: number;
	cached_read_audio_tokens?: number;
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
};

const STORAGE_SESSION_ID = "session_id";
const STORAGE_USAGE = "usage";
const STORAGE_PENDING_SETTLEMENT = "pending_settlement";
const STORAGE_PROVIDER_STATE = "provider_state";

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
	private lastProviderStatePersistAt = 0;
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
	private liveClosing = false;

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
			this.sendUpstream({ setup: buildGoogleBidiGenerateContentSetup({ model, voice, instructions }) });
			return;
		}

		const key = resolveXAIKey();
		if (!key) throw new Error("xai_key_missing");
		this.upstream = await connectWebSocket(
			`wss://api.x.ai/v1/realtime?model=${encodeURIComponent(model)}`,
			{ headers: { Authorization: `Bearer ${key}` } },
		);
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
		if (
			provider !== "spacex-ai" &&
			!closedBeforeReady &&
			(this.responseInFlight || this.inputSinceLastResponse || this.providerState.googleTurnActive)
		) {
			await this.markBillingUnresolved("provider_socket_closed_before_authoritative_usage");
			return;
		}
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
		if (provider !== "spacex-ai") {
			this.inputSinceLastResponse = true;
			this.usage.input_audio_pending = true;
		}
		this.resetIdleTimer();
		await this.checkpointUsage();
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
		this.sendClient({ type: "relay.input_rejected", reason });
		await this.settle("failed", reason);
	}

	private async handleUpstreamMessage(raw: unknown) {
		const text = await parseMessageData(raw);
		if (!text) return;
		this.sendClientRaw(text);
		const event = parseJson(text);
		if (!event || !this.session) return;
		this.providerEventSeen = true;
		const provider = providerFromSession(this.session);
		const type = getStringField(event, "type");
		if (this.isLive) {
			this.usage = { ...this.usage, ...ingestLiveUsage(this.usage, event) };
			if (type === "session.started") {
				this.providerSetupComplete = true;
				this.session = await markRealtimeSessionConnected({
					auth: authForSession(this.session, `live_started:${this.session.session_id}`), sessionId: this.session.session_id,
					providerSessionId: getStringField(getRecordField(event, "session") ?? {}, "id"),
				});
				if (this.liveClosing) this.sendUpstream({ type: "session.close" });
			}
			if (type === "error") { await this.requestLiveClose("failed", "live_provider_error"); return; }
			if (["session.started", "session.usage.updated", "session.closed", "session.delegation.created", "response.event"].includes(type)) {
				await this.checkpointUsage(true);
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
			await this.settle("failed", "provider_session_setup_failed");
			return;
		}
		if (provider === "openai") {
			if (type === "input_audio_buffer.speech_started") this.openAISpeechActive = true;
			if (type === "input_audio_buffer.speech_stopped") this.openAISpeechActive = false;
			if (type === "input_audio_buffer.committed") this.openAIInputCommitted = true;
			if (type === "input_audio_buffer.cleared" && this.waitingForOpenAIInputClear) {
				this.waitingForOpenAIInputClear = false;
				delete this.usage.input_audio_clear_pending;
				this.openAISpeechActive = false;
				if (!this.openAIInputCommitted && !this.responseInFlight) {
					this.inputSinceLastResponse = false;
					delete this.usage.input_audio_pending;
					await this.checkpointUsage(true);
					await this.settle(this.providerCompletedResponseSeen ? "completed" : "cancelled", "client_disconnected_input_cleared");
				}
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
			await this.checkpointUsage();
			void this.maybePersistUsage();
		}

		if (type === "response.done") {
			const response = getRecordField(event, "response");
			const responseId = response ? getStringField(response, "id") : "";
			const usage = response ? getRecordField(response, "usage") : null;
			// A terminal event without authoritative token usage cannot settle
			// an OpenAI turn, even when an earlier turn had valid usage.
			if (provider === "openai" && (!usage || Object.keys(usage).length === 0)) return;
			if (usage && (!responseId || !this.providerState.seenResponseIds.includes(responseId))) {
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
				if (responseId) {
					this.providerState.seenResponseIds = [
						...this.providerState.seenResponseIds.slice(-255),
						responseId,
					];
					await this.persistProviderState();
				}
				await this.persistUsage();
			}
			this.providerCompletedResponseSeen = true;
			await this.emitTurnTelemetry(usage ?? {}, responseId || null);
			this.markResponseComplete();
		}

		if (type === "response.output_audio.done" && provider === "spacex-ai") {
			await this.persistUsage();
			if (!this.providerCompletedResponseSeen) {
				await this.emitTurnTelemetry({}, null);
			}
			this.providerCompletedResponseSeen = true;
			this.markResponseComplete();
		}

		if (provider !== "google-ai-studio") return;
		if (event.setupComplete) {
			this.providerSetupComplete = true;
		}
		const serverContent = getRecordField(event, "serverContent");
		if (serverContent) {
			const modelTurn = getRecordField(serverContent, "modelTurn");
			const parts = modelTurn ? getArrayField<Record<string, unknown>>(modelTurn, "parts") : [];
			for (const part of parts) {
				if (getRecordField(part, "inlineData") || getStringField(part, "text")) {
					this.beginGoogleTurn();
					this.markResponseInFlight();
				}
			}
			// generationComplete precedes turnComplete (and interrupted also has a
			// following turnComplete). Only the latter closes the usage accumulator.
			if (serverContent.turnComplete) {
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
		await this.maybePersistProviderState();
		await this.maybeCompleteGoogleTurn();
	}

	private beginGoogleTurn() {
		if (this.providerState.googleTurnActive) return;
		this.providerState.googleTurnActive = true;
		this.providerState.googleTurnComplete = false;
		this.providerState.googleTurnUsage = {};
	}

	private async maybeCompleteGoogleTurn() {
		if (!this.providerState.googleTurnActive || !this.providerState.googleTurnComplete) return;
		const turnUsage = this.providerState.googleTurnUsage;
		const hasUsage =
			toNumber(turnUsage.input_text_tokens) +
			toNumber(turnUsage.input_audio_tokens) +
			toNumber(turnUsage.output_text_tokens) +
			toNumber(turnUsage.output_audio_tokens) > 0;
		if (!hasUsage) return;
		this.usage = addTokenUsage(this.usage, turnUsage);
		this.providerState.googleTurnActive = false;
		this.providerState.googleTurnComplete = false;
		this.providerState.googleTurnUsage = {};
		this.providerCompletedResponseSeen = true;
		await this.emitTurnTelemetry(turnUsage, null);
		await this.persistProviderState();
		await this.persistUsage();
		this.markResponseComplete();
	}

	private markResponseInFlight() {
		if (!this.responseInFlight) this.turnStartedAtMs = Date.now();
		this.responseInFlight = true;
		this.usage.assistant_response_in_flight = true;
		void this.checkpointUsage(true);
		if (this.drainTimer != null) {
			clearTimeout(this.drainTimer);
			this.drainTimer = null;
		}
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

	private markResponseComplete() {
		this.responseInFlight = false;
		this.openAIInputCommitted = false;
		this.inputSinceLastResponse = this.waitingForOpenAIInputClear;
		delete this.usage.assistant_response_in_flight;
		if (!this.waitingForOpenAIInputClear) delete this.usage.input_audio_pending;
		void this.checkpointUsage(true);
		if (this.waitingForOpenAIInputClear) return;
		if (this.budgetClosing) {
			void this.settle("expired", "realtime_budget_closed_after_response");
			return;
		}
		if (!this.client) {
			void this.settle("completed", "client_disconnected_after_response");
		}
	}

	private async handleClientGone() {
		this.acceptingAudio = false;
		if (this.isLive) { await this.requestLiveClose("cancelled", "client_disconnected"); return; }
		if (this.session && providerFromSession(this.session) === "openai" && this.receivedAudioMs > 0) {
			if (this.openAISpeechActive && !this.openAIInputCommitted && !this.responseInFlight) {
				this.sendUpstream({ type: "input_audio_buffer.commit" });
				this.sendUpstream({ type: "response.create" });
				this.markResponseInFlight();
			} else {
				// Wait for the provider to acknowledge discarding uncommitted input.
				// Never infer silence from PCM volume or settle ahead of queued VAD events.
				this.waitingForOpenAIInputClear = true;
				this.usage.input_audio_clear_pending = true;
				this.inputSinceLastResponse = true;
				this.usage.input_audio_pending = true;
				this.sendUpstream({ type: "input_audio_buffer.clear" });
			}
		}
		await this.checkpointUsage(true);
		if (this.responseInFlight || this.inputSinceLastResponse || this.providerState.googleTurnActive) {
			// Tell Google's VAD that the microphone ended immediately; otherwise
			// the pending input can never finish while we wait for final usage.
			if (this.session && providerFromSession(this.session) === "google-ai-studio") {
				this.sendUpstream({ realtimeInput: { audioStreamEnd: true } });
			}
			await this.state.storage.put(STORAGE_PENDING_SETTLEMENT, {
				status: "cancelled",
				reason: "client_disconnected_drain_timeout",
				phase: "drain",
			} satisfies PendingSettlement);
			await this.state.storage.setAlarm(Date.now() + RELAY_DRAIN_TIMEOUT_MS);
			this.drainTimer = setTimeout(() => {
				void this.forceAuthoritativeUsage("cancelled", "client_disconnected_drain_timeout");
			}, RELAY_DRAIN_TIMEOUT_MS) as unknown as number;
			return;
		}
		await this.settle(this.providerCompletedResponseSeen ? "completed" : "cancelled", "client_disconnected");
	}

	private async forceAuthoritativeUsage(
		status: "completed" | "failed" | "cancelled" | "expired",
		reason: string,
	) {
		if (!this.session || this.settled) return;
		if (this.isLive) { await this.requestLiveClose(status, reason); return; }
		const provider = providerFromSession(this.session);
		if (this.usage.input_audio_clear_pending === true) {
			await this.markBillingUnresolved("openai_input_clear_acknowledgement_missing");
			return;
		}
		if (
			provider === "spacex-ai" ||
			(!this.responseInFlight && !this.inputSinceLastResponse && !this.providerState.googleTurnActive)
		) {
			await this.settle(status, reason);
			return;
		}

		if (provider === "openai") {
			if (this.responseInFlight) {
				this.sendUpstream({ type: "response.cancel" });
			} else {
				this.sendUpstream({ type: "input_audio_buffer.commit" });
				this.sendUpstream({ type: "response.create" });
				this.markResponseInFlight();
			}
		} else if (provider === "google-ai-studio") {
			this.sendUpstream({ realtimeInput: { audioStreamEnd: true } });
		}

		await this.state.storage.put(STORAGE_PENDING_SETTLEMENT, {
			status,
			reason,
			phase: "authoritative",
		} satisfies PendingSettlement);
		await this.state.storage.setAlarm(Date.now() + RELAY_AUTHORITATIVE_USAGE_TIMEOUT_MS);
		if (this.drainTimer != null) clearTimeout(this.drainTimer);
		this.drainTimer = setTimeout(() => {
			void this.settle(status, `${reason}_authoritative_usage_timeout`);
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

	private async maybePersistProviderState() {
		const now = Date.now();
		if (now - this.lastProviderStatePersistAt < RELAY_PROVIDER_STATE_PERSIST_INTERVAL_MS) return;
		this.lastProviderStatePersistAt = now;
		await this.persistProviderState();
	}

	private async persistProviderState() {
		this.lastProviderStatePersistAt = Date.now();
		await this.state.storage.put(STORAGE_PROVIDER_STATE, this.providerState);
	}

	private async persistUsage() {
		if (!this.session || this.settled) return;
		this.lastUsagePersistAt = Date.now();
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
		const provider = this.session ? providerFromSession(this.session) : null;
		if (provider === "openai") {
			this.sendUpstream({
				type: "response.create",
				response: {
					output_modalities: ["audio"],
					instructions: BUDGET_CLOSING_INSTRUCTIONS,
				},
			});
			this.markResponseInFlight();
		} else if (provider === "spacex-ai") {
			this.sendUpstream({
				type: "response.create",
				response: {
					modalities: ["audio", "text"],
					instructions: BUDGET_CLOSING_INSTRUCTIONS,
				},
			});
			this.markResponseInFlight();
		}
		if (this.drainTimer != null) clearTimeout(this.drainTimer);
		await this.state.storage.put(STORAGE_PENDING_SETTLEMENT, {
			status: "expired",
			reason,
			phase: "drain",
		} satisfies PendingSettlement);
		await this.state.storage.setAlarm(Date.now() + RELAY_DRAIN_TIMEOUT_MS);
		this.drainTimer = setTimeout(() => {
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
		if (
			provider !== "spacex-ai" &&
			(this.responseInFlight || this.inputSinceLastResponse || this.providerState.googleTurnActive)
		) {
			return this.markBillingUnresolved(reason);
		}
		this.settling = true;
		this.acceptingAudio = false;
		this.clearTimers();
		const pending: PendingSettlement = { status, reason, phase: "settle" };
		await this.state.storage.put({
			[STORAGE_SESSION_ID]: this.session.session_id,
			[STORAGE_USAGE]: this.usage,
			[STORAGE_PENDING_SETTLEMENT]: pending,
			[STORAGE_PROVIDER_STATE]: this.providerState,
		});
		this.closeUpstream("realtime_relay_settling");
		try {
			await settleRealtimeSession({
				auth: authForSession(this.session, `realtime_relay_settle:${this.session.session_id}`),
				sessionId: this.session.session_id,
				status,
				usage: {
					...this.usage,
					...(this.responseInFlight ? { assistant_response_in_flight: true } : {}),
				},
				disconnectReason: reason,
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
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (message.includes("authoritative_usage") || message.includes("usage_missing_token_meters")) {
				this.settling = false;
				return this.markBillingUnresolved(reason);
			}
			console.error("realtime_relay_settle_failed", error);
			await this.state.storage.setAlarm(Date.now() + RELAY_SETTLEMENT_RETRY_MS);
			this.settling = false;
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

	async alarm() {
		const sessionId = await this.state.storage.get<string>(STORAGE_SESSION_ID);
		if (!sessionId) return;
		this.session = await getRealtimeSessionForInternal(sessionId);
		this.usage = (await this.state.storage.get<RelayUsageAggregate>(STORAGE_USAGE)) ?? this.session.usage ?? {};
		this.providerState = (await this.state.storage.get<RelayProviderState>(STORAGE_PROVIDER_STATE)) ?? this.providerState;
		this.responseInFlight = this.usage.assistant_response_in_flight === true;
		this.inputSinceLastResponse = this.usage.input_audio_pending === true;
		const pending = await this.state.storage.get<PendingSettlement>(STORAGE_PENDING_SETTLEMENT);
		if (pending?.phase === "drain") {
			await this.forceAuthoritativeUsage(pending.status, pending.reason);
			return;
		}
		if (!pending && (this.responseInFlight || this.inputSinceLastResponse || this.providerState.googleTurnActive)) {
			await this.forceAuthoritativeUsage("expired", "realtime_max_duration");
			return;
		}
		await this.settle(pending?.status ?? "expired", pending?.reason ?? "realtime_max_duration");
	}

	private async reconcile(sessionId: string): Promise<Response> {
		const storedSessionId = await this.state.storage.get<string>(STORAGE_SESSION_ID);
		if (!storedSessionId || storedSessionId !== sessionId) {
			return Response.json({ active: false, settled: false });
		}
		if (!this.session) this.session = await getRealtimeSessionForInternal(sessionId);
		this.usage = (await this.state.storage.get<RelayUsageAggregate>(STORAGE_USAGE)) ?? this.session.usage ?? {};
		this.providerState = (await this.state.storage.get<RelayProviderState>(STORAGE_PROVIDER_STATE)) ?? this.providerState;
		this.responseInFlight = this.usage.assistant_response_in_flight === true;
		this.inputSinceLastResponse = this.usage.input_audio_pending === true;
		const pending = await this.state.storage.get<PendingSettlement>(STORAGE_PENDING_SETTLEMENT);
		const needsAuthoritativeDrain =
			this.responseInFlight || this.inputSinceLastResponse || this.providerState.googleTurnActive;
		const settled = pending?.phase === "drain" || (!pending && needsAuthoritativeDrain)
			? (await this.forceAuthoritativeUsage(
				pending?.status ?? "expired",
				pending?.reason ?? "realtime_session_reconciliation_expired",
			), false)
			: await this.settle(
				pending?.status ?? "expired",
				pending?.reason ?? "realtime_session_reconciliation_expired",
			);
		return Response.json({ active: true, settled }, { status: settled ? 200 : 503 });
	}

	private closeUpstream(reason: string) {
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
