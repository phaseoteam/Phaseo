// Purpose: Route handler module.
// Why: Keeps HTTP wiring separate from pipeline logic.
// How: Maps requests to pipeline entrypoints and responses.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { getSupabaseAdmin } from "@/runtime/env";
import { guardAuth, type GuardErr } from "@/pipeline/before/guards";
import { json, withRuntime } from "@/routes/utils";

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
}): { ok: true; teamId: string } | { ok: false; response: Response } {
	const requested = args.requestedTeamId?.trim();
	if (!requested) {
		return { ok: true, teamId: args.authTeamId };
	}
	if (!args.internal && requested !== args.authTeamId) {
		return {
			ok: false,
			response: json(
				{
					ok: false,
					error: "forbidden",
					message: "team_id must match authenticated team",
				},
				403,
				{ "Cache-Control": "no-store" }
			),
		};
	}
	return { ok: true, teamId: requested };
}

async function handleCredits(req: Request) {
	const auth = await guardAuth(req);
	if (!auth.ok) {
		return (auth as GuardErr).response;
	}

	const url = new URL(req.url);
	const teamScope = resolveScopedTeamId({
		authTeamId: auth.value.teamId,
		requestedTeamId: url.searchParams.get("team_id"),
		internal: auth.value.internal,
	});
	if (teamScope.ok === false) {
		return teamScope.response;
	}
	const teamId = teamScope.teamId;

	try {
		const supabase = getSupabaseAdmin();

		const { data: wallet, error } = await supabase
			.from("wallets")
			.select("balance_nanos")
			.eq("team_id", teamId)
			.maybeSingle();

		if (error) {
			throw new Error(error.message || "Failed to fetch wallet");
		}

		const { data: ledgerData, error: ledgerError } = await supabase
			.from("credit_ledger")
			.select("amount_nanos, created_at")
			.eq("team_id", teamId)
			.gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
			.order("created_at", { ascending: false });

		const { count: requestCount, error: countError } = await supabase
			.from("gateway_generations")
			.select("*", { count: "exact", head: true })
			.eq("team_id", teamId)
			.gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

		const thirtyDayUsage = ledgerError ? null : (ledgerData ?? []).reduce(
			(sum, entry) => sum + (entry.amount_nanos || 0),
			0
		);

		return json(
			{
				ok: true,
				credits: {
					remaining: wallet?.balance_nanos ?? 0,
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
	const auth = await guardAuth(req);
	if (!auth.ok) {
		return (auth as GuardErr).response;
	}

	const url = new URL(req.url);
	const teamScope = resolveScopedTeamId({
		authTeamId: auth.value.teamId,
		requestedTeamId: url.searchParams.get("team_id"),
		internal: auth.value.internal,
	});
	if (teamScope.ok === false) {
		return teamScope.response;
	}
	const teamId = teamScope.teamId;
	const days = parseInt(url.searchParams.get("days") || "30", 10);
	const limit = parsePaginationParam(url.searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);
	const offset = parseOffsetParam(url.searchParams.get("offset"));

	try {
		const supabase = getSupabaseAdmin();
		const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

		const { data: generations, error } = await supabase
			.from("gateway_generations")
			.select("request_id, provider, model_id, endpoint, usage, usage_cents_text, created_at, latency_ms")
			.eq("team_id", teamId)
			.gte("created_at", since)
			.order("created_at", { ascending: false })
			.range(offset, offset + limit - 1);

		if (error) {
			throw new Error(error.message || "Failed to fetch activity");
		}

		const { count, error: countError } = await supabase
			.from("gateway_generations")
			.select("*", { count: "exact", head: true })
			.eq("team_id", teamId)
			.gte("created_at", since);

		const totalCost = (generations ?? []).reduce(
			(sum, g) => sum + (parseFloat(g.usage_cents_text || "0") || 0),
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
					cost_cents: parseFloat(g.usage_cents_text || "0"),
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

