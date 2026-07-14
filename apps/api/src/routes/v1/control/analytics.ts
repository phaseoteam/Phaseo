// src/routes/v1/control/analytics.ts
// Purpose: Control-plane route handler for analytics operations.
// Why: Separates admin/control traffic from data-plane requests.
// How: Wires HTTP routes to pipeline entrypoints and response helpers.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { withRuntime, json } from "../../utils";
import { getCache, getSupabaseAdmin } from "@/runtime/env";
import { guardAuth, type GuardErr } from "@/pipeline/before/guards";
import { CAPABILITIES } from "@/lib/authz/capabilities";
import { requireCapability } from "./route-helpers";

const COMPLETED_DAYS_WINDOW = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ANALYTICS_REFRESH_MARKER_PREFIX = "gateway:analytics:rollup-refresh";
const ANALYTICS_REFRESH_COOLDOWN_SECONDS = 600;

function startOfUtcDay(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toFiniteNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim().length > 0) {
        const parsed = Number(value.trim());
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

function toNonEmptyString(value: unknown, fallback = "unknown"): string {
    if (typeof value !== "string") return fallback;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : fallback;
}

function parseDateParam(rawDate: string | null, todayStartUtc: Date): { ok: true; start: Date; end: Date } | { ok: false; response: Response } {
    const windowStart = new Date(todayStartUtc.getTime() - COMPLETED_DAYS_WINDOW * MS_PER_DAY);

    if (!rawDate) {
        return { ok: true, start: windowStart, end: todayStartUtc };
    }

    const value = rawDate.trim();
    if (!DATE_RE.test(value)) {
        return {
            ok: false,
            response: json(
                {
                    ok: false,
                    error: "invalid_request",
                    message: "date must use YYYY-MM-DD format",
                },
                400,
                { "Cache-Control": "no-store" }
            ),
        };
    }

    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
        return {
            ok: false,
            response: json(
                {
                    ok: false,
                    error: "invalid_request",
                    message: "date must be a valid UTC date in YYYY-MM-DD format",
                },
                400,
                { "Cache-Control": "no-store" }
            ),
        };
    }

    if (parsed < windowStart || parsed >= todayStartUtc) {
        return {
            ok: false,
            response: json(
                {
                    ok: false,
                    error: "invalid_request",
                    message: "date must be within the last 30 completed UTC days",
                },
                400,
                { "Cache-Control": "no-store" }
            ),
        };
    }

    return { ok: true, start: parsed, end: new Date(parsed.getTime() + MS_PER_DAY) };
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

type AnalyticsRollupRow = {
    day_bucket: string | null;
    model_id: string | null;
    endpoint: string | null;
    provider: string | null;
    usage_nanos: number | string | null;
    byok_usage_nanos: number | string | null;
    requests: number | string | null;
    prompt_tokens: number | string | null;
    completion_tokens: number | string | null;
    reasoning_tokens: number | string | null;
};

function toModelDisplay(permaslug: string): string {
    const match = permaslug.match(/^(.*)-\d{4}-\d{2}-\d{2}$/);
    if (match && match[1]) return match[1];
    return permaslug;
}

function toDayBucket(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return DATE_RE.test(trimmed) ? trimmed : null;
}

function toProviderName(providerId: string): string {
    const normalized = providerId.trim().toLowerCase();
    const exactMap: Record<string, string> = {
        openai: "OpenAI",
        anthropic: "Anthropic",
        "x-ai": "xAI",
        "google-ai-studio": "Google AI Studio",
        "google-vertex": "Google Vertex",
    };
    if (exactMap[normalized]) return exactMap[normalized];
    return providerId
        .split(/[-_]+/g)
        .filter((part) => part.length > 0)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function toUsdFromNanos(value: number | null): number {
    const nanos = value == null ? 0 : Math.max(0, value);
    return nanos / 1_000_000_000;
}

function toRoundedUsage(value: number): number {
    return Number(value.toFixed(9));
}

async function refreshAnalyticsRollup(args: {
	workspaceId: string;
	startIso: string;
	endIso: string;
}): Promise<void> {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.rpc("refresh_gateway_activity_rollup_daily", {
        p_workspace_id: args.workspaceId,
        p_start: args.startIso,
        p_end: args.endIso,
    });
    if (error) {
        throw new Error(error.message || "Failed to refresh analytics rollup");
	}
}

function buildRefreshMarkerKey(args: {
	workspaceId: string;
	startIso: string;
	endIso: string;
}): string {
	const startDay = args.startIso.slice(0, 10);
	const endDay = args.endIso.slice(0, 10);
	return `${ANALYTICS_REFRESH_MARKER_PREFIX}:${args.workspaceId}:${startDay}:${endDay}`;
}

async function shouldRefreshAnalyticsRollup(args: {
	workspaceId: string;
	startIso: string;
	endIso: string;
}): Promise<boolean> {
	try {
		const cache = getCache();
		const markerKey = buildRefreshMarkerKey(args);
		const marker = await cache.get(markerKey, "text");
		return !marker;
	} catch {
		// Fail open if cache is unavailable so analytics data still updates.
		return true;
	}
}

async function markAnalyticsRollupRefresh(args: {
	workspaceId: string;
	startIso: string;
	endIso: string;
}): Promise<void> {
	try {
		const cache = getCache();
		await cache.put(buildRefreshMarkerKey(args), "1", {
			expirationTtl: ANALYTICS_REFRESH_COOLDOWN_SECONDS,
		});
	} catch {
		// Ignore marker write failures so successful refreshes still return data.
	}
}

async function loadAnalyticsRollupRows(args: {
    workspaceId: string;
    startIso: string;
    endIso: string;
}): Promise<AnalyticsRollupRow[]> {
    const supabase = getSupabaseAdmin();
    const startDay = args.startIso.slice(0, 10);
    const endDay = args.endIso.slice(0, 10);
    const { data, error } = await supabase
        .from("gateway_activity_rollup_daily")
        .select(
            "day_bucket,model_id,endpoint,provider,usage_nanos,byok_usage_nanos,requests,prompt_tokens,completion_tokens,reasoning_tokens"
        )
        .eq("workspace_id", args.workspaceId)
        .gte("day_bucket", startDay)
        .lt("day_bucket", endDay);

    if (error) {
        throw new Error(error.message || "Failed to load analytics rollup rows");
    }

    return (data ?? []) as AnalyticsRollupRow[];
}

async function handleAnalytics(req: Request) {
	const auth = await guardAuth(req);
	if (!auth.ok) {
		return (auth as GuardErr).response;
	}
	const scopeError = requireCapability(auth.value, CAPABILITIES.ANALYTICS_READ);
	if (scopeError) return scopeError;
    const authValue = auth.value;
    const url = new URL(req.url);
    const teamScope = resolveScopedTeamId({
        authTeamId: authValue.workspaceId,
        requestedTeamId: url.searchParams.get("workspace_id"),
        internal: authValue.internal,
    });
    if (teamScope.ok === false) return teamScope.response;
    const workspaceId = teamScope.workspaceId;
    const todayStart = startOfUtcDay(new Date());
    const range = parseDateParam(url.searchParams.get("date"), todayStart);
    if (range.ok === false) return range.response;
    const startIso = range.start.toISOString();
	const endIso = range.end.toISOString();

	try {
		if (
			await shouldRefreshAnalyticsRollup({
				workspaceId,
				startIso,
				endIso,
			})
		) {
			await refreshAnalyticsRollup({
				workspaceId,
				startIso,
				endIso,
			});
			await markAnalyticsRollupRefresh({
				workspaceId,
				startIso,
				endIso,
			});
		}
		const rows = await loadAnalyticsRollupRows({
			workspaceId,
			startIso,
            endIso,
        });

        const data = rows
            .map((row) => {
                const date = toDayBucket(row.day_bucket);
                if (!date) return null;
                const modelPermaslug = toNonEmptyString(row.model_id, "unknown/unknown");
                const endpointId = toNonEmptyString(row.endpoint, "unknown");
                const providerId = toNonEmptyString(row.provider, "unknown");
                return {
                    date,
                    model: toModelDisplay(modelPermaslug),
                    model_permaslug: modelPermaslug,
                    endpoint_id: endpointId,
                    provider_name: toProviderName(providerId),
                    usage: toRoundedUsage(toUsdFromNanos(toFiniteNumber(row.usage_nanos))),
                    byok_usage_inference: toRoundedUsage(
                        toUsdFromNanos(toFiniteNumber(row.byok_usage_nanos))
                    ),
                    requests: Math.max(0, Math.round(toFiniteNumber(row.requests) ?? 0)),
                    prompt_tokens: Math.max(0, Math.round(toFiniteNumber(row.prompt_tokens) ?? 0)),
                    completion_tokens: Math.max(0, Math.round(toFiniteNumber(row.completion_tokens) ?? 0)),
                    reasoning_tokens: Math.max(0, Math.round(toFiniteNumber(row.reasoning_tokens) ?? 0)),
                };
            })
            .filter((item): item is NonNullable<typeof item> => item !== null)
            .sort((a, b) => {
                if (a.date !== b.date) return b.date.localeCompare(a.date);
                if (a.usage !== b.usage) return b.usage - a.usage;
                if (a.requests !== b.requests) return b.requests - a.requests;
                return a.model_permaslug.localeCompare(b.model_permaslug);
            });

        return json(
            { data },
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

export const analyticsRoutes = new Hono<Env>();

analyticsRoutes.get("/", withRuntime(handleAnalytics));









