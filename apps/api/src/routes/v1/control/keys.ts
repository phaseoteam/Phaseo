import { invalidatePrivateRoutes } from "@/pipeline/before/privateModelCache";
// Purpose: Key control-plane routes for current-key inspection and API key lifecycle operations.
// Why: Splits ordinary data-plane key auth from elevated workspace key management.
// How: Uses gateway-key auth for /key-like introspection and management-key auth for CRUD.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { getSupabaseAdmin, getCache, getBindings } from "@/runtime/env";
import { guardAuth, guardManagementAuth, type GuardErr } from "@/pipeline/before/guards";
import { json, withRuntime } from "@/routes/utils";
import { setKeyVersion } from "@/core/kv";
import { generateGatewayKey, hmacSecret, timingSafeEqual } from "@/routes/auth.helpers";
import { resolveActiveKeyPepper } from "@/lib/security/keyPepper";
import { CAPABILITIES } from "@/lib/authz/capabilities";
import { recordWorkspaceAuditEvent } from "@/lib/audit/workspaceAudit";
import { loadOAuthClient } from "@/lib/oauth/service";
import { internalServerError, requireCapability, type ManagementRouteAuth } from "./route-helpers";
import { CHAT_MANAGED_KEY_NAME, enforceWorkspaceKeyLimit, isUsableWorkspaceKey } from "./management-helpers";

type KeyRow = {
	id: string;
	workspace_id: string;
	name: string | null;
	prefix: string | null;
	status: string | null;
	created_by?: string | null;
	created_at?: string | null;
	updated_at?: string | null;
	last_used_at?: string | null;
	soft_blocked?: boolean | null;
	expires_at?: string | null;
	kid?: string | null;
	hash?: string | null;
	daily_limit_cost_nanos?: number | null;
	weekly_limit_cost_nanos?: number | null;
	monthly_limit_cost_nanos?: number | null;
	daily_limit_requests?: number | null;
	weekly_limit_requests?: number | null;
	monthly_limit_requests?: number | null;
	scopes?: string | null;
};

type KeyUsageRow = {
	key_id: string;
	total_request_count?: number | null;
	daily_request_count?: number | null;
	weekly_request_count?: number | null;
	monthly_request_count?: number | null;
	total_cost_nanos?: number | null;
	daily_cost_nanos?: number | null;
	weekly_cost_nanos?: number | null;
	monthly_cost_nanos?: number | null;
	last_used_at?: string | null;
};

const KEY_COLUMNS = "id, hash, workspace_id, name, prefix, status, scopes, created_by, created_at, updated_at, last_used_at, soft_blocked, expires_at, daily_limit_requests, weekly_limit_requests, monthly_limit_requests, daily_limit_cost_nanos, weekly_limit_cost_nanos, monthly_limit_cost_nanos";
const KEY_WITH_KID_COLUMNS = `${KEY_COLUMNS}, kid`;

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 250;

function parsePositiveInt(raw: string | null, fallback: number, max: number): number {
	if (!raw) return fallback;
	const parsed = Number(raw);
	if (!Number.isFinite(parsed)) return fallback;
	const normalized = Math.floor(parsed);
	if (normalized <= 0) return fallback;
	return Math.min(normalized, max);
}

function parseOffset(raw: string | null): number {
	if (!raw) return 0;
	const parsed = Number(raw);
	if (!Number.isFinite(parsed) || parsed < 0) return 0;
	return Math.floor(parsed);
}

function parseBooleanFlag(raw: string | null, fallback = false): boolean {
	if (!raw) return fallback;
	const normalized = raw.trim().toLowerCase();
	if (!normalized) return fallback;
	return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function parsePathId(url: URL): string | null {
	const segments = url.pathname.split("/").filter(Boolean);
	const candidate = segments.at(-1);
	if (!candidate || candidate === "keys" || candidate === "key" || candidate === "invalidate") {
		return null;
	}
	return decodeURIComponent(candidate).trim() || null;
}

function resolveKeyLookupColumn(identifier: string): "id" | "hash" {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identifier)
		? "id"
		: "hash";
}

function nanosToUsd(value: unknown): number | null {
	const nanos = Number(value ?? 0);
	if (!Number.isFinite(nanos) || nanos <= 0) return null;
	return nanos / 1_000_000_000;
}

function usdToNanos(value: number): number {
	return Math.max(0, Math.round(value * 1_000_000_000));
}

function readBearerToken(req: Request): string | null {
	const authorizationHeader = req.headers.get("authorization")?.trim() ?? "";
	if (!authorizationHeader.startsWith("Bearer ")) return null;
	const token = authorizationHeader.slice(7).trim();
	return token || null;
}

function isPhaseoInvalidateControlToken(token: string, bindings: ReturnType<typeof getBindings>): boolean {
	const phaseoBindings = bindings as Record<string, unknown>;
	const candidates = [
		String(phaseoBindings.PHASEO_CONTROL_KEY ?? "").trim(),
		String(phaseoBindings.GATEWAY_CONTROL_KEY ?? "").trim(),
		String(phaseoBindings.AI_STATS_GATEWAY_KEY ?? "").trim(),
	].filter(Boolean);
	return candidates.some((candidate) => timingSafeEqual(token, candidate));
}

function getInvalidateControlSecrets(bindings: ReturnType<typeof getBindings>): string[] {
	const phaseoBindings = bindings as Record<string, unknown>;
	return [
		String(phaseoBindings.PHASEO_CONTROL_SECRET ?? "").trim(),
		String(phaseoBindings.GATEWAY_CONTROL_SECRET ?? "").trim(),
	].filter(Boolean);
}

function resolveLimitWindow(row: KeyRow): { limit: number | null; limitReset: "daily" | "weekly" | "monthly" | null } {
	const daily = nanosToUsd(row.daily_limit_cost_nanos);
	if (daily !== null) return { limit: daily, limitReset: "daily" };
	const weekly = nanosToUsd(row.weekly_limit_cost_nanos);
	if (weekly !== null) return { limit: weekly, limitReset: "weekly" };
	const monthly = nanosToUsd(row.monthly_limit_cost_nanos);
	if (monthly !== null) return { limit: monthly, limitReset: "monthly" };
	return { limit: null, limitReset: null };
}

function parseLimitNumber(raw: unknown): { ok: true; value: number | null | undefined } | { ok: false; message: string } {
	if (raw === undefined) return { ok: true, value: undefined };
	if (raw === null || raw === "") return { ok: true, value: null };
	const parsed = Number(raw);
	if (!Number.isFinite(parsed) || parsed < 0) {
		return { ok: false, message: "limit must be a non-negative number or null" };
	}
	return { ok: true, value: parsed };
}

function parseLimitReset(raw: unknown): { ok: true; value: "daily" | "weekly" | "monthly" | undefined } | { ok: false; message: string } {
	if (raw === undefined || raw === null || raw === "") {
		return { ok: true, value: undefined };
	}
	const normalized = String(raw).trim().toLowerCase();
	if (normalized === "daily" || normalized === "weekly" || normalized === "monthly") {
		return { ok: true, value: normalized };
	}
	return { ok: false, message: "limit_reset must be one of: daily, weekly, monthly" };
}

function applyCostLimitFields(target: Record<string, unknown>, args: {
	limit: number | null | undefined;
	limitReset: "daily" | "weekly" | "monthly" | undefined;
}) {
	if (args.limit === undefined && args.limitReset === undefined) return;
	if (args.limit === null) {
		target.daily_limit_cost_nanos = 0;
		target.weekly_limit_cost_nanos = 0;
		target.monthly_limit_cost_nanos = 0;
		return;
	}
	if (args.limit === undefined) return;
	const limitReset = args.limitReset ?? "monthly";
	const nanos = usdToNanos(args.limit);
	target.daily_limit_cost_nanos = 0;
	target.weekly_limit_cost_nanos = 0;
	target.monthly_limit_cost_nanos = 0;
	if (limitReset === "daily") target.daily_limit_cost_nanos = nanos;
	if (limitReset === "weekly") target.weekly_limit_cost_nanos = nanos;
	if (limitReset === "monthly") target.monthly_limit_cost_nanos = nanos;
}

function applyDetailedLimits(
	target: Record<string, unknown>,
	raw: unknown,
): { ok: true } | { ok: false; message: string } {
	if (raw === undefined) return { ok: true };
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
		return { ok: false, message: "limits must be an object" };
	}
	for (const window of ["daily", "weekly", "monthly"] as const) {
		const value = (raw as Record<string, unknown>)[window];
		if (value === undefined) continue;
		if (!value || typeof value !== "object" || Array.isArray(value)) {
			return { ok: false, message: `limits.${window} must be an object` };
		}
		const bucket = value as Record<string, unknown>;
		for (const metric of ["requests", "cost"] as const) {
			if (bucket[metric] === undefined) continue;
			const parsed = parseLimitNumber(bucket[metric]);
			if (!parsed.ok) return { ok: false, message: `limits.${window}.${metric} must be a non-negative number or null` };
			const normalized = parsed.value ?? 0;
			target[`${window}_limit_${metric === "cost" ? "cost_nanos" : "requests"}`] =
				metric === "cost" ? usdToNanos(normalized) : Math.floor(normalized);
		}
	}
	return { ok: true };
}

function formatApiKey(row: KeyRow, usage?: KeyUsageRow) {
	const status = String(row.status ?? "").trim().toLowerCase();
	const softBlocked = Boolean(row.soft_blocked);
	const { limit, limitReset } = resolveLimitWindow(row);
	const totalCostNanos = Number(usage?.total_cost_nanos ?? 0);
	const dailyCostNanos = Number(usage?.daily_cost_nanos ?? 0);
	const weeklyCostNanos = Number(usage?.weekly_cost_nanos ?? 0);
	const monthlyCostNanos = Number(usage?.monthly_cost_nanos ?? 0);
	const selectedUsage = limitReset === "daily" ? dailyCostNanos : limitReset === "weekly" ? weeklyCostNanos : monthlyCostNanos;
	return {
		id: row.id,
		hash: row.hash ?? row.id,
		workspace_id: row.workspace_id,
		name: row.name ?? null,
		label: row.name ?? null,
		prefix: row.prefix ?? null,
		status: row.status ?? null,
		disabled: status !== "active" || softBlocked,
		soft_blocked: softBlocked,
		scopes: row.scopes ?? "[]",
		include_byok_in_limit: false,
		limit,
		limit_reset: limitReset,
		limit_remaining: limit === null ? null : Math.max(limit - (nanosToUsd(selectedUsage) ?? 0), 0),
		usage: nanosToUsd(totalCostNanos) ?? 0,
		usage_daily: nanosToUsd(dailyCostNanos) ?? 0,
		usage_weekly: nanosToUsd(weeklyCostNanos) ?? 0,
		usage_monthly: nanosToUsd(monthlyCostNanos) ?? 0,
		limits: {
			daily: { requests: Number(row.daily_limit_requests ?? 0) || null, cost: nanosToUsd(row.daily_limit_cost_nanos) },
			weekly: { requests: Number(row.weekly_limit_requests ?? 0) || null, cost: nanosToUsd(row.weekly_limit_cost_nanos) },
			monthly: { requests: Number(row.monthly_limit_requests ?? 0) || null, cost: nanosToUsd(row.monthly_limit_cost_nanos) },
		},
		usage_details: {
			total: { requests: Number(usage?.total_request_count ?? 0), cost: nanosToUsd(totalCostNanos) ?? 0 },
			daily: { requests: Number(usage?.daily_request_count ?? 0), cost: nanosToUsd(dailyCostNanos) ?? 0 },
			weekly: { requests: Number(usage?.weekly_request_count ?? 0), cost: nanosToUsd(weeklyCostNanos) ?? 0 },
			monthly: { requests: Number(usage?.monthly_request_count ?? 0), cost: nanosToUsd(monthlyCostNanos) ?? 0 },
		},
		created_by: row.created_by ?? null,
		creator_user_id: row.created_by ?? null,
		created_at: row.created_at ?? null,
		updated_at: row.updated_at ?? null,
		last_used_at: usage?.last_used_at ?? row.last_used_at ?? null,
		expires_at: row.expires_at ?? null,
	};
}

async function loadKeyUsage(workspaceId: string, keyIds: string[]): Promise<Map<string, KeyUsageRow>> {
	if (keyIds.length === 0) return new Map();
	const { data, error } = await getSupabaseAdmin().rpc("gateway_workspace_key_usage", {
		p_workspace_id: workspaceId,
		p_key_ids: keyIds,
	});
	if (error) throw error;
	return new Map(((data ?? []) as KeyUsageRow[]).map((row) => [row.key_id, row]));
}

async function auditApiKey(
	auth: { workspaceId: string; userId?: string | null; requestId?: string | null },
	action: string,
	key: Pick<KeyRow, "id" | "name" | "prefix">,
	metadata?: Record<string, unknown>,
) {
	await recordWorkspaceAuditEvent(getSupabaseAdmin(), {
		workspaceId: auth.workspaceId,
		actorUserId: auth.userId,
		action,
		targetType: "api_key",
		targetId: key.id,
		targetName: key.name ?? null,
		metadata: { prefix: key.prefix ?? null, ...metadata },
		requestId: auth.requestId,
	});
}

function resolveScopedWorkspaceId(args: {
	authWorkspaceId: string;
	requestedWorkspaceId: string | null;
	internal?: boolean;
}): { ok: true; workspaceId: string } | { ok: false; response: Response } {
	const requested = args.requestedWorkspaceId?.trim();
	if (!requested) {
		return { ok: true, workspaceId: args.authWorkspaceId };
	}
	if (!args.internal && requested !== args.authWorkspaceId) {
		return {
			ok: false,
			response: json(
				{
					ok: false,
					error: "forbidden",
					message: "workspace_id must match authenticated workspace",
				},
				403,
				{ "Cache-Control": "no-store" },
			),
		};
	}
	return { ok: true, workspaceId: requested };
}

async function requireOAuthWorkspaceAdmin(auth: ManagementRouteAuth, workspaceId: string): Promise<Response | null> {
	if (auth.authMethod !== "oauth") return null;
	const userId = auth.userId?.trim();
	if (!userId) {
		return json({ error: "forbidden", message: "OAuth user is required" }, 403, { "Cache-Control": "no-store" });
	}
	const supabase = getSupabaseAdmin();
	const { data, error } = await supabase
		.from("workspace_members")
		.select("role")
		.eq("workspace_id", workspaceId)
		.eq("user_id", userId)
		.maybeSingle();
	if (error || !data) {
		return json({ error: "forbidden", message: "Workspace membership is required" }, 403, { "Cache-Control": "no-store" });
	}
	const role = String((data as { role?: unknown }).role ?? "").toLowerCase();
	if (role !== "owner" && role !== "admin") {
		return json(
			{ error: "forbidden", message: "Workspace owner or admin role is required" },
			403,
			{ "Cache-Control": "no-store" },
		);
	}
	return null;
}

function rejectApiKeyScopes(body: Record<string, unknown>): Response | null {
	if (body.scopes === undefined) return null;
	return json(
		{
			error: "bad_request",
			message: "API key scopes are not supported. Use guardrails, workspace settings, and related policy controls instead.",
		},
		400,
		{ "Cache-Control": "no-store" },
	);
}

async function resolveWorkspaceOwnerUserId(workspaceId: string): Promise<string> {
	const supabase = getSupabaseAdmin();
	const { data, error } = await supabase
		.from("workspaces")
		.select("owner_user_id")
		.eq("id", workspaceId)
		.maybeSingle();
	if (error) {
		throw new Error(error.message || "Failed to resolve workspace owner");
	}
	const ownerUserId = String((data as { owner_user_id?: unknown } | null)?.owner_user_id ?? "").trim();
	if (!ownerUserId) {
		throw new Error("Workspace owner not found");
	}
	return ownerUserId;
}

function resolveExpiresAt(raw: unknown): { ok: true; value: string | null | undefined } | { ok: false; message: string } {
	if (raw === undefined) return { ok: true, value: undefined };
	if (raw === null) return { ok: true, value: null };
	const text = String(raw).trim();
	if (!text) return { ok: true, value: null };
	const parsed = new Date(text);
	if (Number.isNaN(parsed.getTime())) {
		return { ok: false, message: "expires_at must be a valid ISO-8601 datetime or null" };
	}
	return { ok: true, value: parsed.toISOString() };
}

async function invalidateKeyCache(args: { id: string; kid?: string | null }) {
	const nowVersion = Date.now();
	await setKeyVersion("id", args.id, nowVersion);
	if (args.kid) {
		await setKeyVersion("kid", args.kid, nowVersion);
		await getCache().delete(`gateway:key:${args.kid}`);
	}
}

async function handleGetCurrentKey(req: Request) {
	const auth = await guardAuth(req, { useKvCache: false });
	if (!auth.ok) {
		return (auth as GuardErr).response;
	}
	const scopeError = requireCapability(auth.value, CAPABILITIES.KEYS_READ);
	if (scopeError) return scopeError;

	try {
		if (auth.value.authMethod === "oauth") {
			const client = await loadOAuthClient(auth.value.apiKeyId);
			if (!client) {
				return json({ error: "not_found", message: "OAuth client not found" }, 404, { "Cache-Control": "no-store" });
			}
			return json(
				{
					data: {
						id: client.id,
						hash: client.id,
						workspace_id: auth.value.workspaceId,
						name: client.name ?? "OAuth session",
						label: client.name ?? "OAuth session",
						prefix: null,
						status: "active",
						disabled: false,
						soft_blocked: false,
						scopes: [],
						include_byok_in_limit: false,
						limit: null,
						limit_reset: null,
						created_by: auth.value.userId ?? null,
						creator_user_id: auth.value.userId ?? null,
						created_at: null,
						updated_at: null,
						last_used_at: null,
						expires_at: null,
						auth_method: "oauth",
						oauth_client_id: client.id,
						oauth_scopes: auth.value.oauthScopes ?? [],
					},
				},
				200,
				{ "Cache-Control": "no-store" },
			);
		}

		const supabase = getSupabaseAdmin();
		const { data, error } = await supabase
			.from("keys")
			.select(KEY_COLUMNS)
			.eq("id", auth.value.apiKeyId)
			.eq("workspace_id", auth.value.workspaceId)
			.maybeSingle();
		if (error) {
			throw new Error(error.message || "Failed to fetch current API key");
		}
		if (!data) {
			return json({ error: "not_found", message: "API key not found" }, 404, { "Cache-Control": "no-store" });
		}
		const usage = await loadKeyUsage(auth.value.workspaceId, [data.id]);
		return json({ data: formatApiKey(data as KeyRow, usage.get(data.id)) }, 200, { "Cache-Control": "no-store" });
	} catch (error: any) {
		const message = String(error?.message ?? error);
		if (message.includes("Key limit reached")) {
			return json({ error: "key_limit_reached", message }, 400, { "Cache-Control": "no-store" });
		}
		return json(
			{ error: "failed", message },
			500,
			{ "Cache-Control": "no-store" },
		);
	}
}

async function handleListKeys(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) {
		return (auth as GuardErr).response;
	}
	const scopeError = requireCapability(auth.value, CAPABILITIES.KEYS_READ);
	if (scopeError) return scopeError;

	const url = new URL(req.url);
	const workspaceScope = resolveScopedWorkspaceId({
		authWorkspaceId: auth.value.workspaceId,
		requestedWorkspaceId: url.searchParams.get("workspace_id"),
		internal: auth.value.internal,
	});
	if (workspaceScope.ok === false) return workspaceScope.response;
	const roleError = await requireOAuthWorkspaceAdmin(auth.value, workspaceScope.workspaceId);
	if (roleError) return roleError;

	const includeDisabled = parseBooleanFlag(url.searchParams.get("include_disabled"));
	const offset = parseOffset(url.searchParams.get("offset"));
	const limit = parsePositiveInt(url.searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);

	try {
		const supabase = getSupabaseAdmin();
		let query = supabase
			.from("keys")
			.select(KEY_COLUMNS)
			.eq("workspace_id", workspaceScope.workspaceId)
			.neq("name", CHAT_MANAGED_KEY_NAME)
			.order("created_at", { ascending: false })
			.range(offset, offset + limit - 1);
		if (!includeDisabled) {
			query = query.eq("status", "active").eq("soft_blocked", false);
		}

		const { data, error } = await query;
		if (error) {
			throw new Error(error.message || "Failed to list API keys");
		}

		let countQuery = supabase
			.from("keys")
			.select("id", { count: "exact", head: true })
			.eq("workspace_id", workspaceScope.workspaceId)
			.neq("name", CHAT_MANAGED_KEY_NAME);
		if (!includeDisabled) {
			countQuery = countQuery.eq("status", "active").eq("soft_blocked", false);
		}
		const { count, error: countError } = await countQuery;
		if (countError) {
			throw new Error(countError.message || "Failed to count API keys");
		}
		const usage = await loadKeyUsage(workspaceScope.workspaceId, (data ?? []).map((row) => row.id));

		return json(
			{
				data: (data ?? []).map((row) => formatApiKey(row as KeyRow, usage.get(row.id))),
				total_count: count ?? 0,
			},
			200,
			{ "Cache-Control": "no-store" },
		);
	} catch (error: any) {
		const message = String(error?.message ?? error);
		if (message.includes("Key limit reached")) {
			return json({ error: "key_limit_reached", message }, 400, { "Cache-Control": "no-store" });
		}
		return json(
			{ error: "failed", message },
			500,
			{ "Cache-Control": "no-store" },
		);
	}
}

async function handleCreateKey(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) {
		return (auth as GuardErr).response;
	}

	let body: Record<string, unknown>;
	try {
		body = (await req.json()) as Record<string, unknown>;
	} catch (error) {
		if (error instanceof SyntaxError) {
			return json({ error: "invalid_json", message: "Invalid JSON body" }, 400, { "Cache-Control": "no-store" });
		}
		throw error;
	}
	const scopeError = requireCapability(auth.value, CAPABILITIES.KEYS_WRITE);
	if (scopeError) return scopeError;

	const url = new URL(req.url);
	const workspaceScope = resolveScopedWorkspaceId({
		authWorkspaceId: auth.value.workspaceId,
		requestedWorkspaceId: typeof body.workspace_id === "string" ? body.workspace_id : url.searchParams.get("workspace_id"),
		internal: auth.value.internal,
	});
	if (workspaceScope.ok === false) return workspaceScope.response;
	const roleError = await requireOAuthWorkspaceAdmin(auth.value, workspaceScope.workspaceId);
	if (roleError) return roleError;

	const name = String(body.name ?? "").trim();
	if (!name) {
		return json({ error: "bad_request", message: "name is required" }, 400, { "Cache-Control": "no-store" });
	}
	const scopesError = rejectApiKeyScopes(body);
	if (scopesError) return scopesError;
	const limit = parseLimitNumber(body.limit);
	if (limit.ok === false) {
		return json({ error: "bad_request", message: limit.message }, 400, { "Cache-Control": "no-store" });
	}
	const limitReset = parseLimitReset(body.limit_reset);
	if (limitReset.ok === false) {
		return json({ error: "bad_request", message: limitReset.message }, 400, { "Cache-Control": "no-store" });
	}
	const expiresAt = resolveExpiresAt(body.expires_at);
	if (expiresAt.ok === false) {
		return json({ error: "bad_request", message: expiresAt.message }, 400, { "Cache-Control": "no-store" });
	}

	try {
		await enforceWorkspaceKeyLimit(workspaceScope.workspaceId, "api");
		const creatorUserId =
			auth.value.authMethod === "oauth" && auth.value.userId
				? auth.value.userId
				: await resolveWorkspaceOwnerUserId(workspaceScope.workspaceId);
		const pepper = resolveActiveKeyPepper(getBindings());
		if (!pepper) {
			return json(
				{ error: "server_misconfig_missing_pepper", message: "KEY_PEPPER_ACTIVE is not configured" },
				503,
				{ "Cache-Control": "no-store" },
			);
		}

		const generated = generateGatewayKey();
		const hash = await hmacSecret(generated.secret, pepper);
		const status = body.disabled === true ? "paused" : "active";
		const softBlocked = Boolean(body.soft_blocked);
		const insertPayload: Record<string, unknown> = {
			workspace_id: workspaceScope.workspaceId,
			name,
			scopes: "[]",
			kid: generated.kid,
			hash,
			prefix: generated.prefix,
			status,
			created_by: creatorUserId,
			daily_limit_requests: 0,
			weekly_limit_requests: 0,
			monthly_limit_requests: 0,
			daily_limit_cost_nanos: 0,
			weekly_limit_cost_nanos: 0,
			monthly_limit_cost_nanos: 0,
			soft_blocked: softBlocked,
			...(expiresAt.value !== undefined ? { expires_at: expiresAt.value } : {}),
		};
		applyCostLimitFields(insertPayload, {
			limit: limit.value,
			limitReset: limitReset.value,
		});
		const detailedLimits = applyDetailedLimits(insertPayload, body.limits);
		if (detailedLimits.ok === false) {
			return json({ error: "bad_request", message: detailedLimits.message }, 400, { "Cache-Control": "no-store" });
		}

		const supabase = getSupabaseAdmin();
		const { data, error } = await supabase
			.from("keys")
			.insert(insertPayload)
			.select(KEY_COLUMNS)
			.maybeSingle();
		if (error) {
			throw new Error(error.message || "Failed to create API key");
		}
		if (!data) throw new Error("Failed to create API key");
		await auditApiKey(auth.value, "api_key.created", data as KeyRow);

		return json(
			{
				data: {
					...formatApiKey(data as KeyRow),
					key: generated.plaintext,
				},
			},
			201,
			{ "Cache-Control": "no-store" },
		);
	} catch (error: any) {
		return internalServerError("keys.create", error);
	}
}

async function handleGetKey(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) {
		return (auth as GuardErr).response;
	}
	const scopeError = requireCapability(auth.value, CAPABILITIES.KEYS_READ);
	if (scopeError) return scopeError;

	const url = new URL(req.url);
	const keyId = parsePathId(url);
	if (!keyId) {
		return json({ error: "bad_request", message: "Key id is required" }, 400, { "Cache-Control": "no-store" });
	}
	const roleError = await requireOAuthWorkspaceAdmin(auth.value, auth.value.workspaceId);
	if (roleError) return roleError;

	try {
		const supabase = getSupabaseAdmin();
		const lookupColumn = resolveKeyLookupColumn(keyId);
		const { data, error } = await supabase
			.from("keys")
			.select(KEY_COLUMNS)
			.eq("workspace_id", auth.value.workspaceId)
			.neq("name", CHAT_MANAGED_KEY_NAME)
			.eq(lookupColumn, keyId)
			.maybeSingle();
		if (error) {
			throw new Error(error.message || "Failed to fetch API key");
		}
		if (!data) {
			return json({ error: "not_found", message: "API key not found" }, 404, { "Cache-Control": "no-store" });
		}
		const usage = await loadKeyUsage(auth.value.workspaceId, [data.id]);
		return json({ data: formatApiKey(data as KeyRow, usage.get(data.id)) }, 200, { "Cache-Control": "no-store" });
	} catch (error: any) {
		return internalServerError("keys.get", error);
	}
}

async function handleUpdateKey(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) {
		return (auth as GuardErr).response;
	}
	const scopeError = requireCapability(auth.value, CAPABILITIES.KEYS_WRITE);
	if (scopeError) return scopeError;

	const url = new URL(req.url);
	const keyId = parsePathId(url);
	if (!keyId) {
		return json({ error: "bad_request", message: "Key id is required" }, 400, { "Cache-Control": "no-store" });
	}

	let body: Record<string, unknown>;
	try {
		body = (await req.json()) as Record<string, unknown>;
	} catch (error) {
		if (error instanceof SyntaxError) {
			return json({ error: "invalid_json", message: "Invalid JSON body" }, 400, { "Cache-Control": "no-store" });
		}
		throw error;
	}

	const expiresAt = resolveExpiresAt(body.expires_at);
	if (expiresAt.ok === false) {
		return json({ error: "bad_request", message: expiresAt.message }, 400, { "Cache-Control": "no-store" });
	}
	const limit = parseLimitNumber(body.limit);
	if (limit.ok === false) {
		return json({ error: "bad_request", message: limit.message }, 400, { "Cache-Control": "no-store" });
	}
	const limitReset = parseLimitReset(body.limit_reset);
	if (limitReset.ok === false) {
		return json({ error: "bad_request", message: limitReset.message }, 400, { "Cache-Control": "no-store" });
	}
	const scopesError = rejectApiKeyScopes(body);
	if (scopesError) return scopesError;
	const roleError = await requireOAuthWorkspaceAdmin(auth.value, auth.value.workspaceId);
	if (roleError) return roleError;

	try {
		const supabase = getSupabaseAdmin();
		const lookupColumn = resolveKeyLookupColumn(keyId);
		const { data: existing, error: fetchError } = await supabase
			.from("keys")
			.select(KEY_WITH_KID_COLUMNS)
			.eq("workspace_id", auth.value.workspaceId)
			.neq("name", CHAT_MANAGED_KEY_NAME)
			.eq(lookupColumn, keyId)
			.maybeSingle();
		if (fetchError) {
			throw new Error(fetchError.message || "Failed to fetch API key");
		}
		if (!existing) {
			return json({ error: "not_found", message: "API key not found" }, 404, { "Cache-Control": "no-store" });
		}

		const updatePayload: Record<string, unknown> = {};
		if (typeof body.name === "string") {
			const nextName = body.name.trim();
			if (!nextName) {
				return json({ error: "bad_request", message: "name cannot be empty" }, 400, { "Cache-Control": "no-store" });
			}
			updatePayload.name = nextName;
		}
		if (typeof body.disabled === "boolean") {
			updatePayload.status = body.disabled ? "paused" : "active";
		}
		if (typeof body.soft_blocked === "boolean") {
			updatePayload.soft_blocked = body.soft_blocked;
		}
		if (expiresAt.value !== undefined) {
			updatePayload.expires_at = expiresAt.value;
		}
		applyCostLimitFields(updatePayload, {
			limit:
				limit.value === undefined && limitReset.value !== undefined
					? resolveLimitWindow(existing as KeyRow).limit
					: limit.value,
			limitReset: limitReset.value,
		});
		const detailedLimits = applyDetailedLimits(updatePayload, body.limits);
		if (detailedLimits.ok === false) {
			return json({ error: "bad_request", message: detailedLimits.message }, 400, { "Cache-Control": "no-store" });
		}
		const keyStateChanged = ["status", "soft_blocked", "expires_at"].some((field) => field in updatePayload);
		if (keyStateChanged && isUsableWorkspaceKey({ ...existing, ...updatePayload })) {
			await enforceWorkspaceKeyLimit(auth.value.workspaceId, "api", existing.id);
		}

		const { error: updateError } = await supabase
			.from("keys")
			.update(updatePayload)
			.eq("id", existing.id)
			.eq("workspace_id", auth.value.workspaceId);
		if (updateError) {
			throw new Error(updateError.message || "Failed to update API key");
		}
		await invalidateKeyCache({ id: existing.id, kid: existing.kid ?? null });

		const { data: updated, error: refetchError } = await supabase
			.from("keys")
			.select(KEY_COLUMNS)
			.eq("workspace_id", auth.value.workspaceId)
			.eq("id", existing.id)
			.maybeSingle();
		if (refetchError) {
			throw new Error(refetchError.message || "Failed to fetch updated API key");
		}
		if (!updated) throw new Error("Failed to fetch updated API key");
		await auditApiKey(auth.value, "api_key.updated", updated as KeyRow, { changed_fields: Object.keys(updatePayload) });

		return json({ data: formatApiKey(updated as KeyRow) }, 200, { "Cache-Control": "no-store" });
	} catch (error: any) {
		const message = String(error?.message ?? error);
		if (message.startsWith("Key limit reached")) {
			return json({ error: "key_limit_reached", message }, 409, { "Cache-Control": "no-store" });
		}
		return internalServerError("keys.update", error);
	}
}


async function handleDeleteKey(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) {
		return (auth as GuardErr).response;
	}
	const scopeError = requireCapability(auth.value, CAPABILITIES.KEYS_DELETE);
	if (scopeError) return scopeError;

	const url = new URL(req.url);
	const keyId = parsePathId(url);
	if (!keyId) {
		return json({ error: "bad_request", message: "Key id is required" }, 400, { "Cache-Control": "no-store" });
	}
	const roleError = await requireOAuthWorkspaceAdmin(auth.value, auth.value.workspaceId);
	if (roleError) return roleError;

	try {
		const supabase = getSupabaseAdmin();
		const lookupColumn = resolveKeyLookupColumn(keyId);
		const { data: existing, error: fetchError } = await supabase
			.from("keys")
			.select("id, workspace_id, kid, name, status")
			.eq("workspace_id", auth.value.workspaceId)
			.neq("name", CHAT_MANAGED_KEY_NAME)
			.eq(lookupColumn, keyId)
			.maybeSingle();
		if (fetchError) {
			throw new Error(fetchError.message || "Failed to fetch API key");
		}
		if (!existing) {
			return json({ error: "not_found", message: "API key not found" }, 404, { "Cache-Control": "no-store" });
		}
		if (String(existing.status ?? "").toLowerCase() === "deleted") {
			// A previous deletion may have committed while invalidation failed.
			await invalidateKeyCache({ id: existing.id, kid: existing.kid ?? null });
			await supabase.from("key_guardrails").delete().eq("key_id", existing.id);
			await supabase.from("broadcast_destination_keys").delete().eq("key_id", existing.id);
			return json({ deleted: true }, 200, { "Cache-Control": "no-store" });
		}

		const deletedAtIso = new Date().toISOString();
		const tombstoneHash = `deleted:${existing.id}`;
		const { error: updateError } = await supabase
			.from("keys")
			.update({
				status: "deleted",
				expires_at: deletedAtIso,
				soft_blocked: true,
				hash: tombstoneHash,
			})
			.eq("id", existing.id)
			.eq("workspace_id", auth.value.workspaceId);
		if (updateError) {
			throw new Error(updateError.message || "Failed to delete API key");
		}

		// New-version cache misses must see the committed tombstone, not an
		// active row. Never acknowledge deletion before invalidation succeeds.
		try {
			await invalidateKeyCache({ id: existing.id, kid: existing.kid ?? null });
		} finally {
			// The tombstone is committed even if cache invalidation fails.
			await auditApiKey(auth.value, "api_key.deleted", existing as KeyRow);
		}

		await supabase.from("key_guardrails").delete().eq("key_id", existing.id);
		await supabase.from("broadcast_destination_keys").delete().eq("key_id", existing.id);
		return json({ deleted: true }, 200, { "Cache-Control": "no-store" });
	} catch (error: any) {
		return internalServerError("keys.delete", error);
	}
}

async function handleRotateKey(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return (auth as GuardErr).response;
	const scopeError = requireCapability(auth.value, CAPABILITIES.KEYS_WRITE);
	if (scopeError) return scopeError;
	const segments = new URL(req.url).pathname.split("/").filter(Boolean);
	const keyId = segments.at(-2)?.trim();
	if (!keyId) return json({ error: "bad_request", message: "Key id is required" }, 400, { "Cache-Control": "no-store" });
	const roleError = await requireOAuthWorkspaceAdmin(auth.value, auth.value.workspaceId);
	if (roleError) return roleError;
	let body: Record<string, unknown> = {};
	const rawBody = await req.text();
	if (rawBody.trim()) {
		try {
			const parsed = JSON.parse(rawBody);
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new SyntaxError("JSON body must be an object");
			body = parsed as Record<string, unknown>;
		} catch {
			return json({ error: "invalid_json", message: "Invalid JSON body" }, 400, { "Cache-Control": "no-store" });
		}
	}
	const previousExpiry = resolveExpiresAt(body.previous_key_expires_at ?? body.previousKeyExpiresAt);
	if (previousExpiry.ok === false) return json({ error: "bad_request", message: previousExpiry.message }, 400, { "Cache-Control": "no-store" });

	try {
		const supabase = getSupabaseAdmin();
		const lookupColumn = resolveKeyLookupColumn(keyId);
		const { data: existing, error: fetchError } = await supabase.from("keys")
			.select("id,workspace_id,kid,name,prefix,status,scopes,created_by,soft_blocked,expires_at,daily_limit_requests,weekly_limit_requests,monthly_limit_requests,daily_limit_cost_nanos,weekly_limit_cost_nanos,monthly_limit_cost_nanos")
			.eq("workspace_id", auth.value.workspaceId).neq("name", CHAT_MANAGED_KEY_NAME).eq(lookupColumn, keyId).maybeSingle();
		if (fetchError) throw new Error(fetchError.message || "Failed to fetch API key");
		if (!existing || String(existing.status ?? "").toLowerCase() === "deleted") return json({ error: "not_found", message: "API key not found" }, 404, { "Cache-Control": "no-store" });
		await enforceWorkspaceKeyLimit(auth.value.workspaceId, "api", existing.id);
		const pepper = resolveActiveKeyPepper(getBindings());
		if (!pepper) return json({ error: "server_misconfig_missing_pepper", message: "KEY_PEPPER_ACTIVE is not configured" }, 503, { "Cache-Control": "no-store" });
		const generated = generateGatewayKey();
		const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : `${existing.name} (rotated)`;
		const creatorUserId = auth.value.userId ?? await resolveWorkspaceOwnerUserId(auth.value.workspaceId);
		const { data: replacement, error: insertError } = await supabase.from("keys").insert({
			workspace_id: auth.value.workspaceId, name, kid: generated.kid,
			hash: await hmacSecret(generated.secret, pepper), prefix: generated.prefix,
			status: "active", scopes: existing.scopes ?? "[]", created_by: creatorUserId,
			soft_blocked: Boolean(existing.soft_blocked),
			daily_limit_requests: existing.daily_limit_requests ?? 0,
			weekly_limit_requests: existing.weekly_limit_requests ?? 0,
			monthly_limit_requests: existing.monthly_limit_requests ?? 0,
			daily_limit_cost_nanos: existing.daily_limit_cost_nanos ?? 0,
			weekly_limit_cost_nanos: existing.weekly_limit_cost_nanos ?? 0,
			monthly_limit_cost_nanos: existing.monthly_limit_cost_nanos ?? 0,
		}).select(KEY_COLUMNS).maybeSingle();
		if (insertError || !replacement) throw new Error(insertError?.message || "Failed to rotate API key");
		if (previousExpiry.value !== undefined) {
			const { error: expiryError } = await supabase.from("keys").update({ expires_at: previousExpiry.value }).eq("id", existing.id).eq("workspace_id", auth.value.workspaceId);
			if (expiryError) { await supabase.from("keys").delete().eq("id", replacement.id); throw new Error(expiryError.message || "Failed to expire previous API key"); }
			try {
				await invalidateKeyCache({ id: existing.id, kid: existing.kid ?? null });
			} catch (invalidationError) {
				const [deleteReplacement, restorePrevious] = await Promise.all([
					supabase.from("keys").delete().eq("id", replacement.id),
					supabase.from("keys").update({ expires_at: existing.expires_at ?? null }).eq("id", existing.id).eq("workspace_id", auth.value.workspaceId),
				]);
				if (deleteReplacement.error || restorePrevious.error) throw new Error("API key rotation rollback failed after cache invalidation error");
				throw invalidationError;
			}
		}
		await auditApiKey(auth.value, "api_key.rotated", existing as KeyRow, { replacement_key_id: replacement.id, replacement_key_name: name, previous_key_expires_at: previousExpiry.value ?? null });
		return json({ data: { ...formatApiKey(replacement as KeyRow), key: generated.plaintext }, previous_key_expires_at: previousExpiry.value ?? null }, 200, { "Cache-Control": "no-store" });
	} catch (error: any) { return internalServerError("keys.rotate", error); }
}

async function handleInvalidateKey(req: Request) {
	const bindings = getBindings();
	const auth = await guardManagementAuth(req, { useKvCache: false });
	const bearerToken = readBearerToken(req);
	const phaseoControlAuthorised =
		typeof bearerToken === "string" && isPhaseoInvalidateControlToken(bearerToken, bindings);

	if (!auth.ok && !phaseoControlAuthorised) {
		return (auth as GuardErr).response;
	}
	if (!auth.ok) {
		const controlSecrets = getInvalidateControlSecrets(bindings);
		if (controlSecrets.length === 0) {
			return json(
				{ ok: false, error: "control_secret_missing", message: "Key cache invalidation control secret is not configured" },
				503,
				{ "Cache-Control": "no-store" },
			);
		}
		const providedSecret = req.headers.get("x-control-secret")?.trim() ?? "";
		if (!controlSecrets.some((candidate) => timingSafeEqual(providedSecret, candidate))) {
			return json(
				{ ok: false, error: "forbidden", message: "Invalid control secret" },
				403,
				{ "Cache-Control": "no-store" },
			);
		}
	}

	const scopedWorkspaceId = auth.ok ? auth.value.workspaceId : null;

	const url = new URL(req.url);
	const keyId = url.pathname.split("/").slice(-2, -1)[0];
	if (!keyId) {
		return json({ ok: false, error: "key ID is required" }, 400);
	}

	try {
		const supabase = getSupabaseAdmin();
		const { data, error } = await supabase
			.from("keys")
			.select("id, kid, status, workspace_id")
			.eq("id", keyId)
			.maybeSingle();
		if (error) {
			throw new Error(error.message || "Failed to fetch key");
		}
		if (!data) {
			return json({ ok: false, error: "Key not found" }, 404);
		}
		if (scopedWorkspaceId && data.workspace_id !== scopedWorkspaceId) {
			return json(
				{ ok: false, error: "forbidden", message: "Key does not belong to the authenticated workspace" },
				403,
				{ "Cache-Control": "no-store" },
			);
		}

		await invalidateKeyCache({ id: data.id, kid: data.kid ?? null });
		await invalidatePrivateRoutes(data.workspace_id);
		if (auth.ok) await auditApiKey(auth.value, "api_key.cache_invalidated", { id: data.id, name: null, prefix: null });

		return json(
			{
				ok: true,
				key: {
					id: data.id,
					kid: data.kid ?? null,
					workspace_id: data.workspace_id,
					status: data.status,
				},
				message: "Key cache invalidated globally",
			},
			200,
			{ "Cache-Control": "no-store" },
		);
	} catch (error: any) {
		return internalServerError("keys.invalidate_cache", error);
	}
}

export const currentKeyRoutes = new Hono<Env>();
export const keysRoutes = new Hono<Env>();

currentKeyRoutes.get("/", withRuntime(handleGetCurrentKey));

keysRoutes.get("/", withRuntime(handleListKeys));
keysRoutes.post("/", withRuntime(handleCreateKey));
keysRoutes.get("/:id", withRuntime(handleGetKey));
keysRoutes.patch("/:id", withRuntime(handleUpdateKey));
keysRoutes.post("/:id/rotate", withRuntime(handleRotateKey));
keysRoutes.delete("/:id", withRuntime(handleDeleteKey));
keysRoutes.post("/:id/invalidate", withRuntime(handleInvalidateKey));
