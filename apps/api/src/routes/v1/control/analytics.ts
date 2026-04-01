// src/routes/v1/control/analytics.ts
// Purpose: Control-plane route handler for analytics operations.
// Why: Separates admin/control traffic from data-plane requests.
// How: Wires HTTP routes to pipeline entrypoints and response helpers.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { withRuntime, json } from "../../utils";
import { getSupabaseAdmin } from "@/runtime/env";
import { guardAuth, type GuardErr } from "@/pipeline/before/guards";
import {
    resolveCanonicalTokenUsage,
    pickFirstFiniteNumber,
} from "@/core/usage-normalization";

const COMPLETED_DAYS_WINDOW = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 1000;
const MAX_ACTIVITY_ROWS = 100_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function startOfUtcDay(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function formatUtcDate(isoLike: string): string | null {
    const parsed = new Date(isoLike);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
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

type AnalyticsRow = {
    id: string | null;
    created_at: string | null;
    endpoint: string | null;
    model_id: string | null;
    provider: string | null;
    usage: Record<string, unknown> | null;
    byok: boolean | null;
    cost_nanos: number | null;
};

type ActivityBucket = {
    date: string;
    model_permaslug: string;
    endpoint_id: string;
    provider_name: string;
    usage: number;
    byok_usage_inference: number;
    requests: number;
    prompt_tokens: number;
    completion_tokens: number;
    reasoning_tokens: number;
};

function toModelDisplay(permaslug: string): string {
    const match = permaslug.match(/^(.*)-\d{4}-\d{2}-\d{2}$/);
    if (match && match[1]) return match[1];
    return permaslug;
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

async function loadAnalyticsRows(args: {
    teamId: string;
    startIso: string;
    endIso: string;
}): Promise<AnalyticsRow[]> {
    const supabase = getSupabaseAdmin();
    const rows: AnalyticsRow[] = [];
    let offset = 0;

    while (rows.length < MAX_ACTIVITY_ROWS) {
        const { data, error } = await supabase
            .from("gateway_requests")
            .select("id,created_at,endpoint,model_id,provider,usage,byok,cost_nanos")
            .eq("team_id", args.teamId)
            .eq("success", true)
            .gte("created_at", args.startIso)
            .lt("created_at", args.endIso)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .range(offset, offset + PAGE_SIZE - 1);

        if (error) {
            throw new Error(error.message || "Failed to load analytics rows");
        }
        const page = (data ?? []) as AnalyticsRow[];
        if (page.length === 0) break;
        rows.push(...page);
        if (page.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
    }

    return rows;
}

async function handleAnalytics(req: Request) {
    const auth = await guardAuth(req, { useKvCache: false });
    if (!auth.ok) {
        return (auth as GuardErr).response;
    }
    const authValue = auth.value;
    const url = new URL(req.url);
    const teamScope = resolveScopedTeamId({
        authTeamId: authValue.teamId,
        requestedTeamId: url.searchParams.get("team_id"),
        internal: authValue.internal,
    });
    if (teamScope.ok === false) return teamScope.response;
    const teamId = teamScope.teamId;
    const todayStart = startOfUtcDay(new Date());
    const range = parseDateParam(url.searchParams.get("date"), todayStart);
    if (range.ok === false) return range.response;
    const startIso = range.start.toISOString();
    const endIso = range.end.toISOString();

    try {
        const rows = await loadAnalyticsRows({
            teamId,
            startIso,
            endIso,
        });
        const grouped = new Map<string, ActivityBucket>();

        for (const row of rows) {
            if (!row.created_at) continue;
            const date = formatUtcDate(row.created_at);
            if (!date) continue;

            const modelPermaslug = toNonEmptyString(row.model_id, "unknown/unknown");
            const endpointId = toNonEmptyString(row.endpoint, "unknown");
            const providerName = toProviderName(toNonEmptyString(row.provider, "unknown"));
            const key = [date, modelPermaslug, endpointId, providerName].join("::");

            const current = grouped.get(key) ?? {
                date,
                model_permaslug: modelPermaslug,
                endpoint_id: endpointId,
                provider_name: providerName,
                usage: 0,
                byok_usage_inference: 0,
                requests: 0,
                prompt_tokens: 0,
                completion_tokens: 0,
                reasoning_tokens: 0,
            };

            const usage = row.usage && typeof row.usage === "object" ? row.usage : {};
            const tokens = resolveCanonicalTokenUsage(usage);
            const reasoningTokens =
                pickFirstFiniteNumber(usage, [
                    "reasoning_tokens",
                    "output_tokens_details.reasoning_tokens",
                    "completion_tokens_details.reasoning_tokens",
                    "output_details.reasoning_tokens",
                ]) ?? 0;

            const requestUsage = toUsdFromNanos(toFiniteNumber(row.cost_nanos));

            current.usage += requestUsage;
            if (row.byok === true) {
                current.byok_usage_inference += requestUsage;
            }
            current.requests += 1;
            current.prompt_tokens += tokens.inputTokens;
            current.completion_tokens += tokens.outputTokens;
            current.reasoning_tokens += Math.max(0, Math.round(reasoningTokens));

            grouped.set(key, current);
        }

        const data = Array.from(grouped.values())
            .sort((a, b) => {
                if (a.date !== b.date) return b.date.localeCompare(a.date);
                if (a.usage !== b.usage) return b.usage - a.usage;
                if (a.requests !== b.requests) return b.requests - a.requests;
                return a.model_permaslug.localeCompare(b.model_permaslug);
            })
            .map((item) => ({
                date: item.date,
                model: toModelDisplay(item.model_permaslug),
                model_permaslug: item.model_permaslug,
                endpoint_id: item.endpoint_id,
                provider_name: item.provider_name,
                usage: toRoundedUsage(item.usage),
                byok_usage_inference: toRoundedUsage(item.byok_usage_inference),
                requests: item.requests,
                prompt_tokens: item.prompt_tokens,
                completion_tokens: item.completion_tokens,
                reasoning_tokens: item.reasoning_tokens,
            }));

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









