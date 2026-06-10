// Purpose: Route handler module.
// Why: Keeps HTTP wiring separate from pipeline logic.
// How: Maps requests to pipeline entrypoints and responses.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { getSupabaseAdmin } from "@/runtime/env";
import { guardManagementAuth, type GuardErr } from "@/pipeline/before/guards";
import { CAPABILITIES } from "@/lib/authz/capabilities";
import { json, withRuntime } from "@/routes/utils";
import { requireCapability, requireOAuthWorkspaceRole } from "./route-helpers";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 250;

function parsePaginationParam(raw: string | null, fallback: number, max: number): number {
	if (!raw) return fallback;
	const parsed = Number(raw);
	if (!Number.isFinite(parsed)) return fallback;
	const normalized = Math.floor(parsed);
	if (normalized <= 0) return fallback;
	if (normalized > max) return max;
	return normalized;
}

function parseOffsetParam(raw: string | null): number {
	if (!raw) return 0;
	const parsed = Number(raw);
	if (!Number.isFinite(parsed) || parsed < 0) return 0;
	return Math.floor(parsed);
}

function resolveScopedTeamId(args: {
	authTeamId: string;
	requestedTeamId: string | null;
	internal?: boolean;
}): { ok: true; workspaceId: string } | { ok: false; response: Response } {
	const requested = args.requestedTeamId?.trim();
	if (!requested) {
		return { ok: true, workspaceId: args.authTeamId };
	}
	if (!args.internal && requested !== args.authTeamId) {
		return {
			ok: false,
			response: json(
				{
					ok: false,
					error: "forbidden",
					message: "workspace_id must match authenticated team",
				},
				403,
				{ "Cache-Control": "no-store" }
			),
		};
	}
	return { ok: true, workspaceId: requested };
}

async function handleCredits(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) {
		return (auth as GuardErr).response;
	}
	const scopeError = requireCapability(auth.value, CAPABILITIES.CREDITS_READ);
	if (scopeError) return scopeError;

	const url = new URL(req.url);
	const teamScope = resolveScopedTeamId({
		authTeamId: auth.value.workspaceId,
		requestedTeamId: url.searchParams.get("workspace_id"),
		internal: auth.value.internal,
	});
	if (teamScope.ok === false) {
		return teamScope.response;
	}
	const workspaceId = teamScope.workspaceId;
	const roleError = await requireOAuthWorkspaceRole(auth.value, workspaceId, ["owner", "admin", "member"]);
	if (roleError) return roleError;

	try {
		const supabase = getSupabaseAdmin();

		const { data: wallet, error } = await supabase
			.from("wallets")
			.select("balance_nanos,reserved_nanos")
			.eq("workspace_id", workspaceId)
			.maybeSingle();

		if (error) {
			throw new Error(error.message || "Failed to fetch wallet");
		}

		const { data: ledgerData, error: ledgerError } = await supabase
			.from("credit_ledger")
			.select("amount_nanos, created_at")
			.eq("workspace_id", workspaceId)
			.gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
			.order("created_at", { ascending: false });

		const { count: requestCount, error: countError } = await supabase
			.from("gateway_requests")
			.select("*", { count: "exact", head: true })
			.eq("workspace_id", workspaceId)
			.gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

		const thirtyDayUsage = ledgerError ? null : (ledgerData ?? []).reduce(
			(sum, entry) => sum + (entry.amount_nanos || 0),
			0
		);

		const balanceNanos = Number(wallet?.balance_nanos ?? 0) || 0;
		const reservedNanos = Number((wallet as any)?.reserved_nanos ?? 0) || 0;
		const availableNanos = Math.max(0, balanceNanos - reservedNanos);

		return json(
			{
				ok: true,
				credits: {
					remaining: availableNanos,
					balance_nanos: balanceNanos,
					reserved_nanos: reservedNanos,
					available_nanos: availableNanos,
					thirty_day_usage: thirtyDayUsage,
					thirty_day_requests: requestCount ?? 0,
				},
			},
			200,
			{ "Cache-Control": "no-store" }
		);
	} catch (error: any) {
		return json(
			{ ok: false, error: "failed", message: String(error?.message ?? error) },
			500,
			{ "Cache-Control": "no-store" }
		);
	}
}

async function handleActivity(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) {
		return (auth as GuardErr).response;
	}
	const scopeError = requireCapability(auth.value, CAPABILITIES.ACTIVITY_READ);
	if (scopeError) return scopeError;

	const url = new URL(req.url);
	const teamScope = resolveScopedTeamId({
		authTeamId: auth.value.workspaceId,
		requestedTeamId: url.searchParams.get("workspace_id"),
		internal: auth.value.internal,
	});
	if (teamScope.ok === false) {
		return teamScope.response;
	}
	const workspaceId = teamScope.workspaceId;
	const roleError = await requireOAuthWorkspaceRole(auth.value, workspaceId, ["owner", "admin", "member"]);
	if (roleError) return roleError;
	const days = parseInt(url.searchParams.get("days") || "30", 10);
	const limit = parsePaginationParam(url.searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);
	const offset = parseOffsetParam(url.searchParams.get("offset"));

	try {
		const supabase = getSupabaseAdmin();
		const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

		const { data: generations, error } = await supabase
			.from("gateway_requests")
			.select("request_id, provider, model_id, endpoint, usage, cost_nanos, created_at, latency_ms")
			.eq("workspace_id", workspaceId)
			.gte("created_at", since)
			.order("created_at", { ascending: false })
			.range(offset, offset + limit - 1);

		if (error) {
			throw new Error(error.message || "Failed to fetch activity");
		}

		const { count, error: countError } = await supabase
			.from("gateway_requests")
			.select("*", { count: "exact", head: true })
			.eq("workspace_id", workspaceId)
			.gte("created_at", since);

		const totalCost = (generations ?? []).reduce(
			(sum, g) => sum + ((Number((g as any).cost_nanos ?? 0) || 0) / 10_000_000),
			0
		);

		return json(
			{
				ok: true,
				period_days: days,
				limit,
				offset,
				total: count ?? 0,
				total_cost_cents: totalCost,
				activity: (generations ?? []).map((g) => ({
					request_id: g.request_id,
					provider: g.provider,
					model: g.model_id,
					endpoint: g.endpoint,
					usage: g.usage,
					cost_cents: (Number((g as any).cost_nanos ?? 0) || 0) / 10_000_000,
					latency_ms: g.latency_ms,
					timestamp: g.created_at,
				})),
			},
			200,
			{ "Cache-Control": "no-store" }
		);
	} catch (error: any) {
		return json(
			{ ok: false, error: "failed", message: String(error?.message ?? error) },
			500,
			{ "Cache-Control": "no-store" }
		);
	}
}

export const creditsRoutes = new Hono<Env>();
export const activityRoutes = new Hono<Env>();

creditsRoutes.get("/", withRuntime(handleCredits));
activityRoutes.get("/", withRuntime(handleActivity));


