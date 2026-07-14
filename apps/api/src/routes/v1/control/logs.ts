import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { getSupabaseAdmin } from "@/runtime/env";
import { guardManagementAuth, type GuardErr } from "@/pipeline/before/guards";
import { CAPABILITIES } from "@/lib/authz/capabilities";
import { json, withRuntime } from "@/routes/utils";
import {
	parseOffset,
	parsePathId,
	parsePositiveInt,
	requireCapability,
	requireOAuthWorkspaceRole,
} from "./route-helpers";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const DEFAULT_SINCE = "24h";
const MAX_SINCE_MS = 90 * 24 * 60 * 60 * 1000;
const LOG_FIELDS = [
	"request_id",
	"created_at",
	"endpoint",
	"model_id",
	"requested_model_id",
	"routed_model_id",
	"canonical_model_id",
	"provider",
	"status_code",
	"success",
	"error_code",
	"latency_ms",
	"generation_ms",
	"usage",
	"cost_nanos",
	"currency",
	"pricing_lines",
	"key_id",
	"auth_method",
	"oauth_client_id",
	"stream",
	"byok",
	"native_response_id",
	"throughput",
	"location",
	"finish_reason",
].join(",");

type ParsedTimeRange =
	| { ok: true; from: string; to: string | null }
	| { ok: false; response: Response };

function badRequest(message: string): Response {
	return json({ ok: false, error: "bad_request", message }, 400, { "Cache-Control": "no-store" });
}

function parseIsoTime(raw: string | null, name: string): { ok: true; value: string | null } | { ok: false; response: Response } {
	const value = raw?.trim();
	if (!value) return { ok: true, value: null };
	const timestamp = Date.parse(value);
	if (!Number.isFinite(timestamp)) return { ok: false, response: badRequest(`${name} must be a valid ISO-8601 timestamp`) };
	return { ok: true, value: new Date(timestamp).toISOString() };
}

function parseSince(raw: string): number | null {
	const match = raw.trim().toLowerCase().match(/^(\d+)(m|h|d)$/);
	if (!match) return null;
	const amount = Number(match[1]);
	if (!Number.isSafeInteger(amount) || amount <= 0) return null;
	const unitMs = match[2] === "m" ? 60_000 : match[2] === "h" ? 3_600_000 : 86_400_000;
	const duration = amount * unitMs;
	return duration <= MAX_SINCE_MS ? duration : null;
}

function parseTimeRange(url: URL): ParsedTimeRange {
	const explicitFrom = parseIsoTime(url.searchParams.get("from"), "from");
	if (explicitFrom.ok === false) return { ok: false, response: explicitFrom.response };
	const explicitTo = parseIsoTime(url.searchParams.get("to"), "to");
	if (explicitTo.ok === false) return { ok: false, response: explicitTo.response };
	const sinceRaw = url.searchParams.get("since")?.trim();
	if (sinceRaw && explicitFrom.value) return { ok: false, response: badRequest("Use either since or from, not both") };
	const since = parseSince(sinceRaw || DEFAULT_SINCE);
	if (since === null) return { ok: false, response: badRequest("since must use <number>m, <number>h, or <number>d and be at most 90d") };
	const toMs = explicitTo.value ? Date.parse(explicitTo.value) : Date.now();
	const from = explicitFrom.value ?? new Date(toMs - since).toISOString();
	const fromMs = Date.parse(from);
	if (fromMs > toMs) return { ok: false, response: badRequest("from must be before to") };
	if (toMs - fromMs > MAX_SINCE_MS) {
		return { ok: false, response: badRequest("log time range must be at most 90d") };
	}
	return { ok: true, from, to: explicitTo.value };
}

function readFilter(url: URL, name: string, maxLength = 256): { ok: true; value: string | null } | { ok: false; response: Response } {
	const value = url.searchParams.get(name)?.trim();
	if (!value) return { ok: true, value: null };
	if (value.length > maxLength) return { ok: false, response: badRequest(`${name} is too long`) };
	return { ok: true, value };
}

function resolveWorkspace(args: {
	authWorkspaceId: string;
	requestedWorkspaceId: string | null;
	internal?: boolean;
}): { ok: true; workspaceId: string } | { ok: false; response: Response } {
	const requested = args.requestedWorkspaceId?.trim();
	if (!requested) return { ok: true, workspaceId: args.authWorkspaceId };
	if (!args.internal && requested !== args.authWorkspaceId) {
		return { ok: false, response: json({ ok: false, error: "forbidden", message: "workspace_id must match authenticated workspace" }, 403, { "Cache-Control": "no-store" }) };
	}
	return { ok: true, workspaceId: requested };
}

function redactErrorMessage(value: unknown): string | null {
	if (typeof value !== "string") return null;
	return value
		.replace(/\b(Bearer|Basic)\s+[^\s,;]+/gi, "$1 [REDACTED]")
		.replace(/\b(?:phaseo|aistats)_v1_sk_[A-Za-z0-9_-]+/gi, "[REDACTED_API_KEY]")
		.replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, "[REDACTED_SECRET]")
		.replace(/\bAIza[0-9A-Za-z_-]{30,}\b/g, "[REDACTED_SECRET]")
		.replace(/([?&](?:api[_-]?key|key|token|access_token|refresh_token|client_secret)=)[^&#\s]+/gi, "$1[REDACTED]")
		.replace(/\b(api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|authorization|password)\s*[:=]\s*["']?[^"'\s,;&]+["']?/gi, "$1=[REDACTED]")
		.replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1[REDACTED]@")
		.replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
		.slice(0, 2_000);
}

function formatLog(row: Record<string, unknown>) {
	const { error_message: _errorMessage, session_id: _sessionId, ...safeLog } = row;
	return safeLog;
}

function applyStatusFilter(query: any, status: string | null): { ok: true; query: any } | { ok: false; response: Response } {
	if (!status) return { ok: true, query };
	const normalized = status.toLowerCase();
	if (normalized === "success") return { ok: true, query: query.eq("success", true) };
	if (normalized === "error") return { ok: true, query: query.eq("success", false) };
	if (/^[1-5]xx$/.test(normalized)) {
		const lower = Number(normalized[0]) * 100;
		return { ok: true, query: query.gte("status_code", lower).lte("status_code", lower + 99) };
	}
	if (/^[1-5]\d{2}$/.test(normalized)) return { ok: true, query: query.eq("status_code", Number(normalized)) };
	return { ok: false, response: badRequest("status must be success, error, 1xx-5xx, or an exact HTTP status code") };
}

async function authenticateLogsRequest(req: Request, capability: string) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return { ok: false as const, response: (auth as GuardErr).response };
	const scopeError = requireCapability(auth.value, capability, { requireExplicitNonOAuthScope: true });
	if (scopeError) return { ok: false as const, response: scopeError };
	const url = new URL(req.url);
	const workspace = resolveWorkspace({
		authWorkspaceId: auth.value.workspaceId,
		requestedWorkspaceId: url.searchParams.get("workspace_id"),
		internal: auth.value.internal,
	});
	if (workspace.ok === false) return { ok: false as const, response: workspace.response };
	const roleError = await requireOAuthWorkspaceRole(auth.value, workspace.workspaceId, ["owner", "admin", "member"]);
	if (roleError) return { ok: false as const, response: roleError };
	return { ok: true as const, auth: auth.value, workspaceId: workspace.workspaceId, url };
}

async function handleListLogs(req: Request) {
	const authenticated = await authenticateLogsRequest(req, CAPABILITIES.ACTIVITY_READ);
	if (authenticated.ok === false) return authenticated.response;
	const { url, workspaceId } = authenticated;
	const timeRange = parseTimeRange(url);
	if (timeRange.ok === false) return timeRange.response;

	const provider = readFilter(url, "provider");
	if (provider.ok === false) return provider.response;
	const model = readFilter(url, "model");
	if (model.ok === false) return model.response;
	const endpoint = readFilter(url, "endpoint");
	if (endpoint.ok === false) return endpoint.response;
	const requestId = readFilter(url, "request_id");
	if (requestId.ok === false) return requestId.response;
	const keyId = readFilter(url, "key_id");
	if (keyId.ok === false) return keyId.response;
	const sessionId = readFilter(url, "session_id");
	if (sessionId.ok === false) return sessionId.response;
	const errorCode = readFilter(url, "error_code");
	if (errorCode.ok === false) return errorCode.response;

	const limit = parsePositiveInt(url.searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);
	const offset = parseOffset(url.searchParams.get("offset"));
	try {
		let query: any = getSupabaseAdmin()
			.from("gateway_requests")
			.select(LOG_FIELDS, { count: "exact" })
			.eq("workspace_id", workspaceId)
			.gte("created_at", timeRange.from)
			.order("created_at", { ascending: false })
			.range(offset, offset + limit - 1);
		if (timeRange.to) query = query.lte("created_at", timeRange.to);
		if (provider.value) query = query.eq("provider", provider.value);
		if (model.value) query = query.eq("model_id", model.value);
		if (endpoint.value) query = query.eq("endpoint", endpoint.value);
		if (requestId.value) query = query.eq("request_id", requestId.value);
		if (keyId.value) query = query.eq("key_id", keyId.value);
		if (sessionId.value) query = query.eq("session_id", sessionId.value);
		if (errorCode.value) query = query.eq("error_code", errorCode.value);
		const status = applyStatusFilter(query, url.searchParams.get("status"));
		if (status.ok === false) return status.response;
		const { data, error, count } = await status.query;
		if (error) throw error;
		return json({
			ok: true,
			data: (data ?? []).map((row: Record<string, unknown>) => formatLog(row)),
			total: count ?? 0,
			limit,
			offset,
			from: timeRange.from,
			to: timeRange.to,
		}, 200, { "Cache-Control": "no-store" });
	} catch (error) {
		console.error("logs_list_failed", { message: error instanceof Error ? error.message : String(error) });
		return json({ ok: false, error: "failed_to_load_logs" }, 500, { "Cache-Control": "no-store" });
	}
}

async function handleGetLog(req: Request) {
	const authenticated = await authenticateLogsRequest(req, CAPABILITIES.ACTIVITY_READ);
	if (authenticated.ok === false) return authenticated.response;
	const requestId = parsePathId(authenticated.url, "logs");
	if (!requestId) return badRequest("request id is required");
	if (requestId.length > 256) return badRequest("request id is too long");
	try {
		const { data, error } = await getSupabaseAdmin()
			.from("gateway_requests")
			.select(LOG_FIELDS)
			.eq("workspace_id", authenticated.workspaceId)
			.eq("request_id", requestId)
			.order("created_at", { ascending: false })
			.limit(1)
			.maybeSingle();
		if (error) throw error;
		if (!data) return json({ ok: false, error: "not_found" }, 404, { "Cache-Control": "no-store" });
		return json({ ok: true, data: formatLog(data as unknown as Record<string, unknown>) }, 200, { "Cache-Control": "no-store" });
	} catch (error) {
		console.error("logs_get_failed", { message: error instanceof Error ? error.message : String(error) });
		return json({ ok: false, error: "failed_to_load_log" }, 500, { "Cache-Control": "no-store" });
	}
}

export const logsRoutes = new Hono<Env>();

logsRoutes.get("/", withRuntime(handleListLogs));
logsRoutes.get("/:requestId", withRuntime(handleGetLog));
