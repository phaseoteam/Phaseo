// Purpose: Public realtime voice session endpoints.
// Why: Chat and API clients need the same durable billing/session lifecycle.
// How: Authenticates gateway keys, creates/extends/finalizes realtime sessions.

import { Hono } from "hono";
import * as z from "zod";
import { getBindings } from "@/runtime/env";
import type { Env } from "@/runtime/types";
import { guardAuth, guardContext, guardJson } from "@pipeline/before/guards";
import { parseW3cTraceContext } from "@observability/trace-context";
import { guardFreeRouteQuota } from "@core/customer-rate-limits";
import { generatePublicId } from "@pipeline/before/genId";
import { err, json } from "@pipeline/before/http";
import { readRealtimeMaintenance, realtimeMaintenanceResponse } from "@core/realtime-maintenance";
import { hasRequestModelFallbacksField } from "@pipeline/before/requestModelFallbacks";
import { applyWorkspacePolicy, fetchWorkspacePolicy } from "@pipeline/before/workspacePolicy";
import {
	getLiveWebRTCFeatureGateName,
	getRealtimeVoiceFeatureGateName,
	isLiveWebRTCAccessEnabled,
	isRealtimeVoiceAccessEnabled,
} from "@core/feature-flags";
import { withRuntime } from "../../utils";
import { LIVE_BACKENDS, LIVE_MODELS, LIVE_VOICES, isLiveModel, liveModelId, livePolicyCandidates } from "@core/live-sessions";
import { liveBackendSettingsSchema } from "@core/live-settings";
import { LIVE_IDLE_TIMEOUT_MAX_S, LIVE_IDLE_TIMEOUT_MIN_S, LIVE_WEBRTC_MAX_SDP_BYTES, liveSdpOfferError, type LiveStandbyOptions } from "@core/live-webrtc";
import {
	buildSessionEndedEvent,
	classifyRealtimeEnd,
	type RealtimeBillingStatus,
} from "@core/realtime-session-events";
import {
	createRealtimeSession,
	extendRealtimeSessionHold,
	getRealtimeSessionForInternal,
	isRealtimeRelaySecret,
	markRealtimeSessionConnected,
	normalizeRealtimeUsage,
	publicRealtimeSessionPayload,
	realtimeReconciliationToken,
	settleRealtimeSession,
	updateRealtimeSessionUsage,
	type RealtimeAuthContext,
	type RealtimeSessionRow,
} from "@core/realtime-sessions";

type RouteAuthValue = {
	requestId: string;
	workspaceId: string;
	apiKeyId: string;
	apiKeyRef?: string | null;
	apiKeyKid?: string | null;
	userId?: string | null;
	internal?: boolean;
	authMethod?: "api_key" | "oauth";
};

const BASE62 = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

async function deterministicBase62(seed: string, length: number): Promise<string> {
	let output = "";
	for (let counter = 0; output.length < length; counter += 1) {
		const digest = new Uint8Array(await crypto.subtle.digest(
			"SHA-256",
			new TextEncoder().encode(`${seed}:${counter}`),
		));
		for (const byte of digest) {
			output += BASE62[byte % BASE62.length];
			if (output.length >= length) break;
		}
	}
	return output.slice(0, length);
}

const realtimeSessionBaseSchema = z.object({
	model: z.string().trim().min(1).max(160),
	provider: z.string().trim().min(1).max(80).optional(),
	voice: z.string().trim().min(1).max(80).optional(),
	instructions: z.string().trim().max(4000).optional(),
	thinking_level: z.enum(["low", "medium", "high"]).optional(),
	source: z.enum(["api", "chat"]).optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();

export const createRealtimeSessionSchema = realtimeSessionBaseSchema.extend({
	type: z.literal("realtime").optional(),
}).superRefine((value, context) => {
	if (!value.thinking_level) return;
	if (value.model.replace(/^google\//, "") !== "gemini-3.8-live-extended-thinking") {
		context.addIssue({
			code: "custom",
			message: "thinking_level is only supported by gemini-3.8-live-extended-thinking",
			path: ["thinking_level"],
		});
	}
});

const MAX_METADATA_BYTES = 16_384;
const MAX_METADATA_KEYS = 32;
const MAX_METADATA_DEPTH = 4;

export function validateRealtimeMetadata(value: Record<string, unknown> | undefined): boolean {
	if (!value) return true;
	if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_METADATA_BYTES) return false;
	let keys = 0;
	const visit = (current: unknown, depth: number): boolean => {
		if (depth > MAX_METADATA_DEPTH) return false;
		if (!current || typeof current !== "object") return true;
		if (Array.isArray(current)) return current.length <= MAX_METADATA_KEYS && current.every((item) => visit(item, depth + 1));
		for (const nested of Object.values(current as Record<string, unknown>)) {
			keys += 1;
			if (keys > MAX_METADATA_KEYS || !visit(nested, depth + 1)) return false;
		}
		return true;
	};
	return visit(value, 1);
}

const extendSessionSchema = z.object({
	target_reserved_nanos: z.number().int().positive().optional(),
	targetReservedNanos: z.number().int().positive().optional(),
	estimated_cost_nanos: z.number().int().nonnegative().optional(),
	estimatedCostNanos: z.number().int().nonnegative().optional(),
});

const usageSessionSchema = z.object({
	usage: z.record(z.string(), z.unknown()).optional(),
	estimated_cost_nanos: z.number().int().nonnegative().optional(),
	estimatedCostNanos: z.number().int().nonnegative().optional(),
});

const finalizeSessionSchema = z.object({
	status: z.enum(["completed", "failed", "cancelled", "expired"]).optional(),
	usage: z.record(z.string(), z.unknown()).optional(),
	disconnect_reason: z.string().trim().max(240).optional(),
	disconnectReason: z.string().trim().max(240).optional(),
	error_code: z.string().trim().max(120).optional(),
	errorCode: z.string().trim().max(120).optional(),
	error_message: z.string().trim().max(1000).optional(),
	errorMessage: z.string().trim().max(1000).optional(),
});

export const realtimeSessionsRoutes = new Hono<Env>();
export const liveSessionsRoutes = new Hono<Env>();
export const createLiveSessionSchema = realtimeSessionBaseSchema.omit({ thinking_level: true }).extend({
	type: z.literal("live").optional(),
	model: z.enum([...LIVE_MODELS, ...LIVE_MODELS.map((model) => model.replace(/^openai\//, ""))] as [string, ...string[]]),
	provider: z.literal("openai"),
	voice: z.enum(LIVE_VOICES).default("marin"), source: z.enum(["api", "chat"]).optional(),
	backend_model: z.enum(LIVE_BACKENDS).default(LIVE_BACKENDS[0]),
	backend_settings: liveBackendSettingsSchema.optional(),
	// WebSocket (the default) goes through the relay; WebRTC sends the browser's SDP offer.
	transport: z.discriminatedUnion("type", [
		z.object({ type: z.literal("websocket") }).strict(),
		z.object({ type: z.literal("webrtc"), sdp: z.string().min(1).max(LIVE_WEBRTC_MAX_SDP_BYTES) }).strict(),
	]).optional(),
	// Standby (WebRTC only): wait for speech before inference, and pause again after idle_timeout_s.
	wake_policy: z.object({ type: z.literal("speech"), vad_threshold: z.number().min(0).max(1).optional() }).strict().optional(),
	idle_timeout_s: z.number().int().min(LIVE_IDLE_TIMEOUT_MIN_S).max(LIVE_IDLE_TIMEOUT_MAX_S).optional(),
}).strict().superRefine((value, context) => {
	const webrtc = value.transport?.type === "webrtc";
	for (const field of ["wake_policy", "idle_timeout_s"] as const) {
		if (value[field] !== undefined && !webrtc) {
			context.addIssue({ code: "custom", path: [field], message: `${field} is only supported with transport type webrtc` });
		}
	}
	if (value.idle_timeout_s !== undefined && !value.wake_policy) {
		context.addIssue({ code: "custom", path: ["idle_timeout_s"], message: "idle_timeout_s needs a wake_policy" });
	}
});

function toAuthContext(value: RouteAuthValue): RealtimeAuthContext {
	return {
		requestId: value.requestId,
		workspaceId: value.workspaceId,
		apiKeyId: value.apiKeyId,
		userId: value.userId ?? null,
		internal: value.internal,
	};
}

function sessionIdFromPath(req: Request, suffix: string): string {
	const parts = new URL(req.url).pathname.split("/").filter(Boolean);
	const suffixIndex = parts.lastIndexOf(suffix);
	return suffixIndex > 0 ? parts[suffixIndex - 1] ?? "" : "";
}

export function isRealtimeSessionId(value: string): boolean {
	return /^rt_[0-9a-hjkmnp-tv-z]{26}$/.test(value);
}

export function realtimeRelaySecretFromProtocols(value: string | null): string | null {
	const protocol = (value ?? "")
		.split(",")
		.map((candidate) => candidate.trim())
		.find((candidate) => candidate.startsWith("rtsec."));
	const secret = protocol?.slice("rtsec.".length) ?? "";
	return isRealtimeRelaySecret(secret) ? secret : null;
}

export async function admitRealtimeRelay(req: Request, env: Env["Bindings"]): Promise<boolean> {
	const production = String(env.ENV ?? "").trim().toLowerCase() === "prod";
	try {
		if (!env.REALTIME_RELAY_RATE_LIMITER) return !production;
		const clientAddress = req.headers.get("cf-connecting-ip") ?? "unknown";
		const digest = await crypto.subtle.digest(
			"SHA-256",
			new TextEncoder().encode(`realtime-relay:${clientAddress}`),
		);
		const key = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
		return (await env.REALTIME_RELAY_RATE_LIMITER.limit({ key })).success;
	} catch (error) {
		console.error("Realtime relay rate limiter unavailable", error);
		return !production;
	}
}

function errorMessage(error: unknown): string {
	if (error instanceof Error && error.message.trim()) return error.message;
	if (typeof error === "string" && error.trim()) return error.trim();
	if (error && typeof error === "object") {
		const record = error as Record<string, unknown>;
		const parts = [
			record.message,
			record.details,
			record.hint,
			record.code,
			record.name,
		]
			.map((value) => (typeof value === "string" ? value.trim() : ""))
			.filter(Boolean);
		if (parts.length) return parts.join(" | ");
		try {
			return JSON.stringify(record);
		} catch {
			return "realtime_session_error_object";
		}
	}
	return String(error);
}

export function responseForError(error: unknown, requestId?: string, workspaceId?: string): Response {
	const message = errorMessage(error);
	if (message.includes("realtime_billing_review_required")) {
		return err("key_limit_exceeded", { reason: "realtime_billing_review_required",
			message: "Realtime access is paused while a previous session's billing is reviewed. Please contact support.",
			request_id: requestId, workspace_id: workspaceId });
	}
	if (message === "live_price_card_missing") {
		return err("unsupported_model_or_endpoint", { reason: message,
			message: "This GPT Live model has no published price yet, so a session can't start.", request_id: requestId, workspace_id: workspaceId });
	}
	if (message === "live_backend_price_card_missing") {
		return err("unsupported_model_or_endpoint", { reason: message,
			message: "The selected Live backend needs complete pricing before a session can start.", request_id: requestId, workspace_id: workspaceId });
	}
	if (
		message.includes("realtime_creation_rate_limit") ||
		(message.includes("realtime_") && message.includes("concurrency_limit"))
	) {
		return err("key_limit_exceeded", {
			reason: message.includes("creation_rate") ? "realtime_creation_rate_limit" : "realtime_concurrency_limit",
			request_id: requestId,
			workspace_id: workspaceId,
		});
	}
	const budget = /(?:workspace|department)_(?:daily|weekly|monthly|lifetime)_cost_budget_reached/.exec(message);
	if (budget) {
		return err("key_limit_exceeded", { reason: budget[0], request_id: requestId, workspace_id: workspaceId });
	}
	if (message.includes("insufficient_funds") || message.includes("insufficient_balance")) {
		return err("insufficient_funds", {
			reason: "realtime_credit_hold_failed",
			min_usd: 5,
			request_id: requestId,
			workspace_id: workspaceId,
		});
	}
	if (message === "realtime_price_card_missing") {
		return err("unsupported_model_or_endpoint", {
			reason: "realtime_price_card_missing",
			endpoint: "audio.realtime",
			request_id: requestId,
			workspace_id: workspaceId,
		});
	}
	if (message === "realtime_transcription_option_not_supported") {
		return err("validation_error", {
			reason: message,
			description: "Streaming transcription sessions don't speak back; remove voice and instructions",
			request_id: requestId,
			workspace_id: workspaceId,
		});
	}
	if (message === "realtime_session_not_found") {
		return err("not_found", {
			reason: "realtime_session_not_found",
			request_id: requestId,
			workspace_id: workspaceId,
		});
	}
	if (message === "realtime_session_forbidden") {
		return err("unauthorised", {
			reason: "realtime_session_forbidden",
			request_id: requestId,
			workspace_id: workspaceId,
		});
	}
	if (message === "realtime_settlement_internal_only") {
		return err("unauthorised", {
			reason: "realtime_settlement_internal_only",
			request_id: requestId,
			workspace_id: workspaceId,
		});
	}
	if (message === "realtime_public_api_disabled") {
		return err("not_ready", {
			reason: "realtime_public_api_disabled",
			request_id: requestId,
			workspace_id: workspaceId,
		});
	}
	if (message === "realtime_chat_source_forbidden" || message === "realtime_chat_user_missing") {
		return err("unauthorised", {
			reason: message,
			request_id: requestId,
			workspace_id: workspaceId,
		});
	}
	if (message.includes("key_missing")) {
		return err("upstream_error", {
			reason: "realtime_provider_not_configured",
			request_id: requestId,
			workspace_id: workspaceId,
		});
	}
	console.error("realtime_session_request_failed", {
		requestId,
		workspaceId,
		error,
	});
	return err("gateway_error", {
		reason: "realtime_session_error",
		request_id: requestId,
		workspace_id: workspaceId,
	});
}

function normalizedProvider(value: string): string {
	const provider = value.trim().toLowerCase();
	if (provider === "xai" || provider === "x-ai") return "spacex-ai";
	if (provider === "google") return "google-ai-studio";
	if (provider === "eleven-labs") return "elevenlabs";
	if (provider === "mistralai") return "mistral";
	return provider;
}

function providerFromModel(model: string): string | null {
	const prefix = model.trim().toLowerCase().split("/", 1)[0];
	if (prefix === "xai" || prefix === "x-ai") return "spacex-ai";
	if (prefix === "google") return "google-ai-studio";
	if (prefix === "eleven-labs") return "elevenlabs";
	if (prefix === "mistralai") return "mistral";
	return ["openai", "spacex-ai", "google-ai-studio", "elevenlabs", "mistral"].includes(prefix) ? prefix : null;
}

export async function authorizeRealtimeSource(args: {
	auth: RouteAuthValue;
	source: "api" | "chat";
	metadata?: Record<string, unknown>;
}): Promise<string | null> {
	if (args.source === "api") {
		return args.auth.userId ?? null;
	}

	const bindings = getBindings();
	const seed = String(bindings.CHAT_ROUTE_KEY_SEED ?? bindings.KEY_PEPPER_ACTIVE ?? "").trim();
	if (!seed || args.auth.authMethod !== "api_key") {
		throw new Error("realtime_chat_source_forbidden");
	}
	const metadataUserId = typeof args.metadata?.userId === "string" ? args.metadata.userId.trim() : "";
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(metadataUserId)) {
		throw new Error("realtime_chat_user_missing");
	}
	const expectedKid = await deterministicBase62(`${seed}:kid:${args.auth.workspaceId}:${metadataUserId}`, 12);
	if (args.auth.apiKeyKid !== expectedKid) {
		throw new Error("realtime_chat_source_forbidden");
	}
	return metadataUserId;
}

async function createSessionRequest(req: Request, live = false): Promise<Response> {
	const auth = await guardAuth(req);
	if (auth.ok !== true) return auth.response;
	if (auth.value.authMethod === "oauth") {
		return err("unauthorised", {
			reason: "realtime_oauth_scope_not_available",
			request_id: auth.value.requestId,
			workspace_id: auth.value.workspaceId,
		});
	}
	// During a maintenance window no new call starts; calls already running carry on.
	const maintenance = await readRealtimeMaintenance();
	if (maintenance) {
		return realtimeMaintenanceResponse(maintenance, { requestId: auth.value.requestId, workspaceId: auth.value.workspaceId });
	}
	const body = await guardJson(req, auth.value.workspaceId, auth.value.requestId);
	if (body.ok !== true) return body.response;
	if (hasRequestModelFallbacksField(body.value)) {
		// A session binds one model for its lifetime; there is no request to retry.
		return err("validation_error", {
			reason: "models_not_supported_for_endpoint",
			description: "Realtime sessions use a single model; remove models and choose one model",
			details: [{ message: "models is not supported for realtime sessions", path: ["models"], keyword: "models_not_supported_for_endpoint" }],
			request_id: auth.value.requestId,
			workspace_id: auth.value.workspaceId,
		});
	}
	const parsed = (live ? createLiveSessionSchema : createRealtimeSessionSchema).safeParse(body.value);
	if (!parsed.success) {
		return err("validation_error", {
			details: parsed.error.flatten(),
			request_id: auth.value.requestId,
			workspace_id: auth.value.workspaceId,
		});
	}
	if (!validateRealtimeMetadata(parsed.data.metadata)) {
		return err("validation_error", {
			reason: "realtime_metadata_exceeds_limits",
			request_id: auth.value.requestId,
			workspace_id: auth.value.workspaceId,
		});
	}
	const webrtc = "transport" in parsed.data && parsed.data.transport?.type === "webrtc" ? parsed.data.transport : null;
	if (webrtc) {
		const sdpError = liveSdpOfferError(webrtc.sdp);
		if (sdpError) {
			return err("validation_error", { reason: sdpError,
				message: "transport.sdp must be the browser's SDP offer with an audio track (at most 64 KB).",
				request_id: auth.value.requestId, workspace_id: auth.value.workspaceId });
		}
		// Client-executed function calls are answered over the relay's WebSocket, which a
		// WebRTC call doesn't have. Web search runs on the backend and works on both.
		const settings = "backend_settings" in parsed.data ? parsed.data.backend_settings : undefined;
		if (settings?.tools?.length) {
			return err("validation_error", { reason: "live_webrtc_function_tools_not_supported",
				message: "Function tools are not supported with transport type webrtc yet. Use the websocket transport, or remove backend_settings.tools.",
				request_id: auth.value.requestId, workspace_id: auth.value.workspaceId });
		}
	}
	if (!live && isLiveModel(parsed.data.model)) {
		return err("unsupported_model_or_endpoint", { reason: "live_sessions_endpoint_required",
			message: "GPT Live sessions are created with POST /v1/live/sessions.",
			request_id: auth.value.requestId, workspace_id: auth.value.workspaceId });
	}
	const backendModel = "backend_model" in parsed.data ? String(parsed.data.backend_model) : undefined;
	const liveModel = live ? liveModelId(parsed.data.model) : null;
	const context = await guardContext({
		workspaceId: auth.value.workspaceId,
		apiKeyId: auth.value.apiKeyId,
		endpoint: live ? "responses" : "audio.realtime",
		capability: live ? "text.generate" : "audio.realtime",
		model: backendModel ?? parsed.data.model,
		requestId: auth.value.requestId,
		internal: auth.value.internal,
	});
	if (context.ok !== true) return context.response;
	const source = parsed.data.source ?? "api";
	let trustedUserId: string | null;
	try {
		trustedUserId = await authorizeRealtimeSource({
			auth: auth.value,
			source,
			metadata: parsed.data.metadata,
		});
	} catch (error) {
		return responseForError(error, auth.value.requestId, auth.value.workspaceId);
	}
	if (!await isRealtimeVoiceAccessEnabled({
		ok: true,
		...auth.value,
		userId: trustedUserId,
	}, undefined, source)) {
		return err("unauthorised", {
			reason: "realtime_voice_feature_flag_disabled",
			feature_gate: getRealtimeVoiceFeatureGateName(undefined, source),
			request_id: auth.value.requestId,
			workspace_id: auth.value.workspaceId,
		});
	}
	if (webrtc && !await isLiveWebRTCAccessEnabled({ ok: true, ...auth.value, userId: trustedUserId })) {
		return err("unauthorised", {
			reason: "live_webrtc_feature_flag_disabled",
			message: "WebRTC for GPT Live isn't enabled for this account yet. Omit transport to use the WebSocket relay.",
			feature_gate: getLiveWebRTCFeatureGateName(),
			request_id: auth.value.requestId,
			workspace_id: auth.value.workspaceId,
		});
	}

	let workspacePolicy;
	try {
		workspacePolicy = await fetchWorkspacePolicy({
			workspaceId: auth.value.workspaceId,
			apiKeyId: auth.value.apiKeyId,
		});
	} catch {
		return err("gateway_error", {
			reason: "workspace_policy_fetch_failed",
			request_id: auth.value.requestId,
			workspace_id: auth.value.workspaceId,
		});
	}
	const resolvedModel = context.value.resolvedModel || parsed.data.model;
	const requestedProvider = parsed.data.provider ? normalizedProvider(parsed.data.provider) : providerFromModel(resolvedModel);
	const policyResult = applyWorkspacePolicy({
		providers: context.value.providers,
		resolvedModel,
		body: {
			model: resolvedModel,
			...(requestedProvider ? { provider: requestedProvider } : {}),
		},
		workspacePolicy,
	});
	if (policyResult.ok === false) {
		return err("guardrail_blocked", {
			reason: policyResult.reason === "model_not_allowed"
				? "workspace_model_not_allowed"
				: "workspace_provider_not_allowed",
			request_id: auth.value.requestId,
			workspace_id: auth.value.workspaceId,
		});
	}
	if (liveModel && !applyWorkspacePolicy({ providers: livePolicyCandidates(context.value.providers, liveModel), resolvedModel: liveModel,
		body: { model: liveModel, provider: "openai" }, workspacePolicy }).ok) {
		return err("guardrail_blocked", { reason: "workspace_model_not_allowed" });
	}
	const selectedProvider = requestedProvider ?? policyResult.providers[0]?.providerId ?? null;
	if (!selectedProvider || !policyResult.providers.some((candidate: { providerId?: string }) => candidate.providerId === selectedProvider)) {
		return err("unsupported_model_or_endpoint", {
			reason: "realtime_provider_not_available",
			model: resolvedModel,
			provider: selectedProvider,
			endpoint: "audio.realtime",
			request_id: auth.value.requestId,
			workspace_id: auth.value.workspaceId,
		});
	}
	if (!live) {
		const quotaResponse = await guardFreeRouteQuota({
			workspaceId: auth.value.workspaceId,
			userId: auth.value.userId,
			requestId: auth.value.requestId,
			admissionId: generatePublicId(),
			pricingCard: policyResult.providers.find(candidate => candidate.providerId === selectedProvider)?.pricingCard,
			internal: auth.value.internal,
		});
		if (quotaResponse) return quotaResponse;
	}
	try {
		const created = await createRealtimeSession({
			auth: {
				...toAuthContext(auth.value),
				userId: trustedUserId,
			},
			model: liveModel ?? resolvedModel,
			liveBackendModel: backendModel,
			liveBackendSettings: "backend_settings" in parsed.data ? parsed.data.backend_settings : undefined,
			provider: selectedProvider,
			voice: parsed.data.voice,
			instructions: parsed.data.instructions,
			thinkingLevel: "thinking_level" in parsed.data ? parsed.data.thinking_level : undefined,
			source,
			metadata: parsed.data.metadata,
			otelTraceContext: parseW3cTraceContext(
				req.headers.get("traceparent"),
				req.headers.get("tracestate"),
			),
			relay: true,
			...(live ? { liveTransport: webrtc ? "webrtc" as const : "websocket" as const } : {}),
		});
		if (webrtc) {
			const standby: LiveStandbyOptions = {
				...("wake_policy" in parsed.data && parsed.data.wake_policy ? { wake_policy: parsed.data.wake_policy } : {}),
				...("idle_timeout_s" in parsed.data && parsed.data.idle_timeout_s != null ? { idle_timeout_s: parsed.data.idle_timeout_s } : {}),
			};
			return await startLiveWebRTCSession(created, webrtc.sdp, standby, auth.value.requestId, auth.value.workspaceId);
		}
		return json(publicRealtimeSessionPayload(created), 201);
	} catch (error) {
		return responseForError(error, auth.value.requestId, auth.value.workspaceId);
	}
}

function liveRelayStub(sessionId: string): DurableObjectStub | null {
	const binding = getBindings().REALTIME_RELAY;
	return binding ? binding.get(binding.idFromName(sessionId)) : null;
}

async function liveRelayRequest(sessionId: string, path: string, init: RequestInit = {}): Promise<Response> {
	const stub = liveRelayStub(sessionId);
	if (!stub) throw new Error("realtime_relay_not_configured");
	return stub.fetch(new Request(`https://realtime.internal/internal/${path}`, {
		...init,
		headers: { ...(init.headers as Record<string, string> | undefined), "x-realtime-reconcile-token": await realtimeReconciliationToken() },
	}));
}

/**
 * Hands the caller's SDP offer to the relay, which creates the OpenAI session with our key and
 * keeps its sideband. The relay secret stays server-side: a WebRTC caller never gets a relay
 * URL, a client secret or OpenAI's session id, only the SDP answer and our rt_ id.
 */
async function startLiveWebRTCSession(
	created: Awaited<ReturnType<typeof createRealtimeSession>>,
	sdp: string,
	standby: LiveStandbyOptions,
	requestId: string,
	workspaceId: string,
): Promise<Response> {
	const sessionId = created.session.session_id;
	let response: Response;
	try {
		response = await liveRelayRequest(sessionId, "live-webrtc", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ session_id: sessionId, token: created.clientSecret, sdp, standby }),
		});
	} catch (error) {
		// The session was never claimed; the reconciliation job releases its hold at $0.
		console.error("live_webrtc_relay_unavailable", { sessionId, error });
		return err("upstream_error", { reason: "live_webrtc_relay_unavailable", request_id: requestId, workspace_id: workspaceId });
	}
	const payload = await response.json().catch(() => null) as { sdp?: unknown; session?: RealtimeSessionRow; error?: string; message?: string } | null;
	if (response.status !== 201 || typeof payload?.sdp !== "string") {
		if (payload?.error === "live_webrtc_offer_rejected") {
			return err("validation_error", { reason: payload.error, message: payload.message ?? "OpenAI rejected the SDP offer.",
				request_id: requestId, workspace_id: workspaceId });
		}
		return err("upstream_error", { reason: payload?.error ?? "live_webrtc_create_failed", request_id: requestId, workspace_id: workspaceId });
	}
	return json({
		...publicRealtimeSessionPayload({ session: payload.session ?? created.session }),
		transport: { type: "webrtc", sdp: payload.sdp },
	}, 201);
}

function liveSessionOwned(session: RealtimeSessionRow, auth: RouteAuthValue): boolean {
	return session.workspace_id === auth.workspaceId && isLiveModel(session.model_id)
		&& (auth.internal === true || !session.key_id || session.key_id === auth.apiKeyId);
}

const TERMINAL_STATUSES = ["completed", "failed", "cancelled", "expired", "billing_unresolved"];

/**
 * A Live session's state, warnings and, once it has ended, the same session.ended a WebSocket
 * client receives. WebRTC clients poll this: Phaseo's events can't use OpenAI's data channel.
 */
export function liveSessionStatusPayload(session: RealtimeSessionRow, relay: { standby?: boolean | null; warnings?: unknown[] } | null) {
	const transport = session.metadata?.live_transport === "webrtc" ? "webrtc" : "websocket";
	const terminal = TERMINAL_STATUSES.includes(session.status);
	const billingStatus: RealtimeBillingStatus = session.status === "billing_unresolved" ? "unresolved"
		: session.final_cost_nanos == null ? "pending" : "settled";
	const startedAt = Date.parse(session.connected_at ?? session.started_at);
	const endedAt = Date.parse(session.ended_at ?? "");
	return {
		...publicRealtimeSessionPayload({ session }),
		transport: { type: transport },
		standby: terminal ? null : relay?.standby ?? null,
		warnings: relay?.warnings ?? [],
		ended: terminal ? buildSessionEndedEvent({
			sessionId: session.session_id,
			end: classifyRealtimeEnd(session.disconnect_reason ?? ""),
			durationSeconds: Number.isFinite(startedAt) && Number.isFinite(endedAt) ? Math.max(0, (endedAt - startedAt) / 1000) : 0,
			usage: normalizeRealtimeUsage(session.usage ?? {}),
			costNanos: Number(session.final_cost_nanos ?? session.estimated_cost_nanos ?? 0) || 0,
			estimated: billingStatus !== "settled",
			estimateBasis: billingStatus === "settled" ? null : "running_estimate",
			billingStatus,
		}) : null,
	};
}

liveSessionsRoutes.get("/:sessionId", withRuntime(async (req) => {
	const auth = await guardAuth(req);
	if (auth.ok !== true) return auth.response;
	const sessionId = new URL(req.url).pathname.split("/").filter(Boolean).at(-1) ?? "";
	const notFound = () => err("not_found", { reason: "realtime_session_not_found", request_id: auth.value.requestId, workspace_id: auth.value.workspaceId });
	if (!isRealtimeSessionId(sessionId)) return notFound();
	try {
		const session = await getRealtimeSessionForInternal(sessionId);
		if (!liveSessionOwned(session, auth.value)) return notFound();
		let relay: { standby?: boolean | null; warnings?: unknown[] } | null = null;
		if (session.metadata?.live_transport === "webrtc" && !TERMINAL_STATUSES.includes(session.status)) {
			relay = await liveRelayRequest(sessionId, `live-status/${sessionId}`, { method: "GET" })
				.then((response) => response.ok ? response.json() as Promise<typeof relay> : null)
				.catch((error) => { console.error("live_webrtc_status_unavailable", { sessionId, error }); return null; });
		}
		return json(liveSessionStatusPayload(session, relay));
	} catch (error) {
		if (error instanceof Error && error.message === "realtime_session_not_found") return notFound();
		return responseForError(error, auth.value.requestId, auth.value.workspaceId);
	}
}));

// Ends a WebRTC call through the gateway, for a client whose data channel is not open.
liveSessionsRoutes.post("/:sessionId/close", withRuntime(async (req) => {
	const auth = await guardAuth(req);
	if (auth.ok !== true) return auth.response;
	const sessionId = sessionIdFromPath(req, "close");
	const notFound = () => err("not_found", { reason: "realtime_session_not_found", request_id: auth.value.requestId, workspace_id: auth.value.workspaceId });
	if (!isRealtimeSessionId(sessionId)) return notFound();
	try {
		const session = await getRealtimeSessionForInternal(sessionId);
		if (!liveSessionOwned(session, auth.value)) return notFound();
		if (session.metadata?.live_transport !== "webrtc") {
			return err("validation_error", { reason: "live_webrtc_session_required",
				message: "WebSocket sessions end with session.end on the relay socket.", request_id: auth.value.requestId, workspace_id: auth.value.workspaceId });
		}
		if (!TERMINAL_STATUSES.includes(session.status)) {
			const response = await liveRelayRequest(sessionId, `live-close/${sessionId}`, { method: "POST" });
			if (!response.ok && response.status !== 409) throw new Error(`live_webrtc_close_http_${response.status}`);
		}
		return json(liveSessionStatusPayload(await getRealtimeSessionForInternal(sessionId), null), 202);
	} catch (error) {
		return responseForError(error, auth.value.requestId, auth.value.workspaceId);
	}
}));
realtimeSessionsRoutes.post("/", withRuntime((req) => createSessionRequest(req)));
liveSessionsRoutes.post("/", withRuntime((req) => createSessionRequest(req, true)));

const relayRoutes = new Hono<Env>();
relayRoutes.get("/:sessionId/relay", async (c) => {
	const upgrade = c.req.header("Upgrade");
	if (upgrade?.toLowerCase() !== "websocket") {
		return err("validation_error", { reason: "websocket_upgrade_required" });
	}
	const binding = c.env.REALTIME_RELAY;
	if (!binding) {
		return err("gateway_error", { reason: "realtime_relay_not_configured" });
	}
	const sessionId = sessionIdFromPath(c.req.raw, "relay");
	if (!isRealtimeSessionId(sessionId)) {
		return err("validation_error", { reason: "realtime_session_id_invalid" });
	}
	if (!realtimeRelaySecretFromProtocols(c.req.header("Sec-WebSocket-Protocol") ?? null)) {
		return err("unauthorised", { reason: "realtime_relay_token_invalid" });
	}
	if (!(await admitRealtimeRelay(c.req.raw, c.env))) {
		return err("key_limit_exceeded", { reason: "realtime_relay_rate_limit" });
	}
	const id = binding.idFromName(sessionId);
	return binding.get(id).fetch(c.req.raw);
});
realtimeSessionsRoutes.route("/", relayRoutes);
liveSessionsRoutes.route("/", relayRoutes);

realtimeSessionsRoutes.post("/:sessionId/connected", withRuntime(async (req) => {
	const auth = await guardAuth(req);
	if (auth.ok !== true) return auth.response;
	if (!auth.value.internal) return err("unauthorised", { reason: "realtime_relay_owned_lifecycle" });
	try {
		const session = await markRealtimeSessionConnected({
			auth: toAuthContext(auth.value),
			sessionId: sessionIdFromPath(req, "connected"),
		});
		return json(publicRealtimeSessionPayload({ session }));
	} catch (error) {
		return responseForError(error, auth.value.requestId, auth.value.workspaceId);
	}
}));

realtimeSessionsRoutes.post("/:sessionId/extend", withRuntime(async (req) => {
	const auth = await guardAuth(req);
	if (auth.ok !== true) return auth.response;
	if (!auth.value.internal) return err("unauthorised", { reason: "realtime_relay_owned_lifecycle" });
	const body = await guardJson(req, auth.value.workspaceId, auth.value.requestId);
	if (body.ok !== true) return body.response;
	const parsed = extendSessionSchema.safeParse(body.value);
	if (!parsed.success) {
		return err("validation_error", {
			details: parsed.error.flatten(),
			request_id: auth.value.requestId,
			workspace_id: auth.value.workspaceId,
		});
	}
	try {
		const session = await extendRealtimeSessionHold({
			auth: toAuthContext(auth.value),
			sessionId: sessionIdFromPath(req, "extend"),
			targetReservedNanos: parsed.data.target_reserved_nanos ?? parsed.data.targetReservedNanos,
			estimatedCostNanos: parsed.data.estimated_cost_nanos ?? parsed.data.estimatedCostNanos,
		});
		return json(publicRealtimeSessionPayload({ session }));
	} catch (error) {
		return responseForError(error, auth.value.requestId, auth.value.workspaceId);
	}
}));

realtimeSessionsRoutes.post("/:sessionId/usage", withRuntime(async (req) => {
	const auth = await guardAuth(req);
	if (auth.ok !== true) return auth.response;
	if (!auth.value.internal) return err("unauthorised", { reason: "realtime_relay_owned_lifecycle" });
	const body = await guardJson(req, auth.value.workspaceId, auth.value.requestId);
	if (body.ok !== true) return body.response;
	const parsed = usageSessionSchema.safeParse(body.value);
	if (!parsed.success) {
		return err("validation_error", {
			details: parsed.error.flatten(),
			request_id: auth.value.requestId,
			workspace_id: auth.value.workspaceId,
		});
	}
	try {
		const session = await updateRealtimeSessionUsage({
			auth: toAuthContext(auth.value),
			sessionId: sessionIdFromPath(req, "usage"),
			usage: parsed.data.usage ?? {},
			estimatedCostNanos: parsed.data.estimated_cost_nanos ?? parsed.data.estimatedCostNanos,
		});
		return json(publicRealtimeSessionPayload({ session }));
	} catch (error) {
		return responseForError(error, auth.value.requestId, auth.value.workspaceId);
	}
}));

realtimeSessionsRoutes.post("/:sessionId/finalize", withRuntime(async (req) => {
	const auth = await guardAuth(req);
	if (auth.ok !== true) return auth.response;
	const body = await guardJson(req, auth.value.workspaceId, auth.value.requestId);
	if (body.ok !== true) return body.response;
	const parsed = finalizeSessionSchema.safeParse(body.value);
	if (!parsed.success) {
		return err("validation_error", {
			details: parsed.error.flatten(),
			request_id: auth.value.requestId,
			workspace_id: auth.value.workspaceId,
		});
	}
	try {
		const result = await settleRealtimeSession({
			auth: toAuthContext(auth.value),
			sessionId: sessionIdFromPath(req, "finalize"),
			status: parsed.data.status ?? "completed",
			usage: parsed.data.usage ?? {},
			disconnectReason: parsed.data.disconnect_reason ?? parsed.data.disconnectReason,
			errorCode: parsed.data.error_code ?? parsed.data.errorCode,
			errorMessage: parsed.data.error_message ?? parsed.data.errorMessage,
		});
		return json({
			...publicRealtimeSessionPayload({ session: result.session }),
			settlement: result.settlement,
			usage: result.pricedUsage,
		});
	} catch (error) {
		return responseForError(error, auth.value.requestId, auth.value.workspaceId);
	}
}));
