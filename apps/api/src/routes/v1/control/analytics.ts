// src/routes/v1/control/analytics.ts
// Purpose: Control-plane route handler for analytics operations.
// Why: Separates admin/control traffic from data-plane requests.
// How: Wires HTTP routes to pipeline entrypoints and response helpers.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { withRuntime, json } from "../../utils";
import { getSupabaseAdmin } from "@/runtime/env";
import { guardAuth, type GuardErr } from "@/pipeline/before/guards";

const COMPLETED_DAYS_WINDOW = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

type GatewayAnalyticsRequestRow = {
	created_at: string | null;
	model_id: string | null;
	endpoint: string | null;
	provider: string | null;
	cost_nanos: number | string | null;
	byok: boolean | null;
	usage: Record<string, unknown> | null;
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

function usageValueAsBigInt(usage: Record<string, unknown> | null, path: string[]): bigint {
	if (!usage) return 0n;
	let current: unknown = usage;
	for (const key of path) {
		if (!current || typeof current !== "object" || Array.isArray(current)) return 0n;
		current = (current as Record<string, unknown>)[key];
	}
	if (typeof current === "number" && Number.isFinite(current)) {
		return BigInt(Math.max(0, Math.floor(current)));
	}
	if (typeof current === "string" && /^\d+$/.test(current.trim())) {
		return BigInt(current.trim());
	}
	return 0n;
}

function nanosValueAsBigInt(value: unknown): bigint {
	if (typeof value === "number" && Number.isFinite(value)) {
		return BigInt(Math.max(0, Math.floor(value)));
	}
	if (typeof value === "string" && /^\d+$/.test(value.trim())) {
		return BigInt(value.trim());
	}
	return 0n;
}

async function loadAnalyticsRollupRows(args: {
    workspaceId: string;
    startIso: string;
    endIso: string;
}): Promise<AnalyticsRollupRow[]> {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
        .from("gateway_requests")
        .select("created_at,model_id,endpoint,provider,cost_nanos,byok,usage")
        .eq("workspace_id", args.workspaceId)
        .eq("success", true)
        .gte("created_at", args.startIso)
        .lt("created_at", args.endIso);

    if (error) {
        throw new Error(error.message || "Failed to load analytics rows");
    }

	const grouped = new Map<string, {
		day_bucket: string;
		model_id: string;
		endpoint: string;
		provider: string;
		usage_nanos: bigint;
		byok_usage_nanos: bigint;
		requests: bigint;
		prompt_tokens: bigint;
		completion_tokens: bigint;
		reasoning_tokens: bigint;
	}>();

	for (const row of (data ?? []) as GatewayAnalyticsRequestRow[]) {
		if (typeof row.created_at !== "string") continue;
		const createdAt = new Date(row.created_at);
		if (Number.isNaN(createdAt.getTime())) continue;
		const dayBucket = createdAt.toISOString().slice(0, 10);
		const modelId = toNonEmptyString(row.model_id, "unknown/unknown");
		const endpoint = toNonEmptyString(row.endpoint, "unknown");
		const provider = toNonEmptyString(row.provider, "unknown");
		const usageRecord =
			row.usage && typeof row.usage === "object" && !Array.isArray(row.usage)
				? row.usage
				: null;
		const promptTokens = usageValueAsBigInt(usageRecord, ["input_tokens"])
			|| usageValueAsBigInt(usageRecord, ["prompt_tokens"]);
		const completionTokens = usageValueAsBigInt(usageRecord, ["output_tokens"])
			|| usageValueAsBigInt(usageRecord, ["completion_tokens"]);
		const reasoningTokens = usageValueAsBigInt(usageRecord, ["reasoning_tokens"])
			|| usageValueAsBigInt(usageRecord, ["output_tokens_details", "reasoning_tokens"])
			|| usageValueAsBigInt(usageRecord, ["completion_tokens_details", "reasoning_tokens"])
			|| usageValueAsBigInt(usageRecord, ["output_details", "reasoning_tokens"]);
		const usageNanos = nanosValueAsBigInt(row.cost_nanos);
		const byokUsageNanos = row.byok ? usageNanos : 0n;
		const groupKey = `${dayBucket}::${modelId}::${endpoint}::${provider}`;
		const current = grouped.get(groupKey) ?? {
			day_bucket: dayBucket,
			model_id: modelId,
			endpoint,
			provider,
			usage_nanos: 0n,
			byok_usage_nanos: 0n,
			requests: 0n,
			prompt_tokens: 0n,
			completion_tokens: 0n,
			reasoning_tokens: 0n,
		};
		current.usage_nanos += usageNanos;
		current.byok_usage_nanos += byokUsageNanos;
		current.requests += 1n;
		current.prompt_tokens += promptTokens;
		current.completion_tokens += completionTokens;
		current.reasoning_tokens += reasoningTokens;
		grouped.set(groupKey, current);
	}

	return Array.from(grouped.values()).map((row) => ({
		day_bucket: row.day_bucket,
		model_id: row.model_id,
		endpoint: row.endpoint,
		provider: row.provider,
		usage_nanos: Number(row.usage_nanos),
		byok_usage_nanos: Number(row.byok_usage_nanos),
		requests: Number(row.requests),
		prompt_tokens: Number(row.prompt_tokens),
		completion_tokens: Number(row.completion_tokens),
		reasoning_tokens: Number(row.reasoning_tokens),
	}));
}

async function handleAnalytics(req: Request) {
	const auth = await guardAuth(req);
	if (!auth.ok) {
		return (auth as GuardErr).response;
	}
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









