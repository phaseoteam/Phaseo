// Purpose: Public realtime voice session endpoints.
// Why: Chat and API clients need the same durable billing/session lifecycle.
// How: Authenticates gateway keys, creates/extends/finalizes realtime sessions.

import { Hono } from "hono";
import { z } from "zod";
import { getBindings, getSupabaseAdmin } from "@/runtime/env";
import type { Env } from "@/runtime/types";
import { guardAuth, guardContext, guardJson } from "@pipeline/before/guards";
import { err, json } from "@pipeline/before/http";
import { applyWorkspacePolicy, fetchWorkspacePolicy } from "@pipeline/before/workspacePolicy";
import { withRuntime } from "../../utils";
import {
	createRealtimeSession,
	extendRealtimeSessionHold,
	markRealtimeSessionConnected,
	publicRealtimeSessionPayload,
	settleRealtimeSession,
	updateRealtimeSessionUsage,
	type RealtimeAuthContext,
} from "@core/realtime-sessions";

type RouteAuthValue = {
	requestId: string;
	workspaceId: string;
	apiKeyId: string;
	userId?: string | null;
	internal?: boolean;
};

const CHAT_MANAGED_KEY_NAME = "__chat_route_managed_key__";

const createSessionSchema = z.object({
	model: z.string().trim().min(1).max(160),
	provider: z.string().trim().min(1).max(80).optional(),
	voice: z.string().trim().min(1).max(80).optional(),
	instructions: z.string().trim().max(4000).optional(),
	source: z.enum(["api", "chat"]).optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
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

function responseForError(error: unknown, requestId?: string, workspaceId?: string): Response {
	const message = errorMessage(error);
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

function isEnabled(value: unknown): boolean {
	return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function normalizedProvider(value: string): string {
	const provider = value.trim().toLowerCase();
	if (provider === "xai") return "x-ai";
	if (provider === "google") return "google-ai-studio";
	return provider;
}

function providerFromModel(model: string): string | null {
	const prefix = model.trim().toLowerCase().split("/", 1)[0];
	if (prefix === "xai") return "x-ai";
	if (prefix === "google") return "google-ai-studio";
	return ["openai", "x-ai", "google-ai-studio"].includes(prefix) ? prefix : null;
}

async function authorizeRealtimeSource(args: {
	auth: RouteAuthValue;
	source: "api" | "chat";
	metadata?: Record<string, unknown>;
}): Promise<string | null> {
	if (args.source === "api") {
		if (!args.auth.internal && !isEnabled(getBindings().REALTIME_PUBLIC_API_ENABLED)) {
			throw new Error("realtime_public_api_disabled");
		}
		return args.auth.userId ?? null;
	}

	const { data, error } = await getSupabaseAdmin()
		.from("keys")
		.select("name,status")
		.eq("id", args.auth.apiKeyId)
		.eq("workspace_id", args.auth.workspaceId)
		.maybeSingle();
	if (error) throw error;
	if (!data || data.name !== CHAT_MANAGED_KEY_NAME || data.status !== "active") {
		throw new Error("realtime_chat_source_forbidden");
	}
	const metadataUserId = typeof args.metadata?.userId === "string" ? args.metadata.userId.trim() : "";
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(metadataUserId)) {
		throw new Error("realtime_chat_user_missing");
	}
	return metadataUserId;
}

realtimeSessionsRoutes.post("/", withRuntime(async (req) => {
	const auth = await guardAuth(req);
	if (auth.ok !== true) return auth.response;
	if (auth.value.authMethod === "oauth") {
		return err("unauthorised", {
			reason: "realtime_oauth_scope_not_available",
			request_id: auth.value.requestId,
			workspace_id: auth.value.workspaceId,
		});
	}
	const body = await guardJson(req, auth.value.workspaceId, auth.value.requestId);
	if (body.ok !== true) return body.response;
	const parsed = createSessionSchema.safeParse(body.value);
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
	const context = await guardContext({
		workspaceId: auth.value.workspaceId,
		apiKeyId: auth.value.apiKeyId,
		endpoint: "audio.realtime",
		capability: "audio.realtime",
		model: parsed.data.model,
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
		teamSettings: context.value.context.teamSettings ?? null,
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
	try {
		const created = await createRealtimeSession({
			auth: {
				...toAuthContext(auth.value),
				userId: trustedUserId,
			},
			model: resolvedModel,
			provider: selectedProvider,
			voice: parsed.data.voice,
			instructions: parsed.data.instructions,
			source,
			metadata: parsed.data.metadata,
			relay: true,
		});
		return json(publicRealtimeSessionPayload(created), 201);
	} catch (error) {
		return responseForError(error, auth.value.requestId, auth.value.workspaceId);
	}
}));

realtimeSessionsRoutes.get("/:sessionId/relay", async (c) => {
	const upgrade = c.req.header("Upgrade");
	if (upgrade?.toLowerCase() !== "websocket") {
		return err("validation_error", { reason: "websocket_upgrade_required" });
	}
	const binding = c.env.REALTIME_RELAY;
	if (!binding) {
		return err("gateway_error", { reason: "realtime_relay_not_configured" });
	}
	const sessionId = sessionIdFromPath(c.req.raw, "relay");
	const id = binding.idFromName(sessionId);
	return binding.get(id).fetch(c.req.raw);
});

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
