// src/routes/v1/control/analytics.ts
// Purpose: Control-plane route handler for analytics operations.
// Why: Separates admin/control traffic from data-plane requests.
// How: Wires HTTP routes to pipeline entrypoints and response helpers.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { withRuntime, json } from "../../utils";
import { getSupabaseAdmin } from "@/runtime/env";
import { guardAuth, type GuardErr } from "@/pipeline/before/guards";
import { CAPABILITIES } from "@/lib/authz/capabilities";
import { requireCapability } from "./route-helpers";

const COMPLETED_DAYS_WINDOW = 30;
const ANALYTICS_FACT_PAGE_SIZE = 1000;
const ANALYTICS_FACT_MAX_ROWS = 10_000;
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

type AnalyticsFactRow = {
    occurred_at: string | null;
    endpoint: string | null;
    requested_model_slug: string | null;
    routed_model_slug: string | null;
    provider_model_id: string | null;
    cost_nanos: number | string | null;
    byok: boolean | null;
	success: boolean | null;
    v2_request_usage: Array<{
        meter_key: string | null;
        quantity: number | string | null;
    }> | null;
};

class AnalyticsFactLimitError extends Error {}

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
        "spacex-ai": "SpaceXAI",
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

function optionalFilter(url: URL, name: string, max: number, pattern: RegExp): string | null | false {
	const value = url.searchParams.get(name)?.trim() || null;
	return !value || (value.length <= max && pattern.test(value)) ? value : false;
}

function optionalBoolean(url: URL, name: string): boolean | null | false {
	const value = url.searchParams.get(name)?.trim().toLowerCase();
	if (!value) return null;
	if (value === "true") return true;
	if (value === "false") return false;
	return false as const;
}

async function loadAnalyticsFactRows(args: {
    workspaceId: string;
    startIso: string;
    endIso: string;
    labelKey?: string | null;
    labelValue?: string | null;
	keyId?: string | null;
	endUserId?: string | null;
	model?: string | null;
	providerModelIds?: string[] | null;
	endpoint?: string | null;
	byok?: boolean | null;
	success?: boolean | null;
}): Promise<AnalyticsFactRow[]> {
    const supabase = getSupabaseAdmin();
    const rows: AnalyticsFactRow[] = [];
	const countQuery = supabase
		.from("v2_request_facts")
		.select("request_event_id", { count: "exact", head: true });
	countQuery
		.eq("workspace_id", args.workspaceId)
		.gte("occurred_at", args.startIso)
		.lt("occurred_at", args.endIso);
	if (args.labelKey && args.labelValue) {
		countQuery.contains("safe_metadata", { labels: [{ key: args.labelKey, value: args.labelValue }] });
	}
	applyFactFilters(countQuery, args);
	const resolvedCountResult = await countQuery;
	if (resolvedCountResult.error) {
		throw new Error(resolvedCountResult.error.message || "Failed to count v2 analytics request facts");
	}
	if (resolvedCountResult.count == null) {
		throw new Error("Failed to count v2 analytics request facts");
	}
	if (resolvedCountResult.count > ANALYTICS_FACT_MAX_ROWS) {
		throw new AnalyticsFactLimitError(
			"Analytics range contains too many requests; select a single date"
		);
	}
    for (let offset = 0; offset < ANALYTICS_FACT_MAX_ROWS; offset += ANALYTICS_FACT_PAGE_SIZE) {
        const dataQuery = supabase
            .from("v2_request_facts")
            .select(
                "occurred_at,endpoint,requested_model_slug,routed_model_slug,provider_model_id,cost_nanos,byok,success,v2_request_usage(meter_key,quantity)"
            )
            .eq("workspace_id", args.workspaceId)
            .gte("occurred_at", args.startIso)
            .lt("occurred_at", args.endIso)
            .order("occurred_at", { ascending: true });
		if (args.labelKey && args.labelValue) {
			dataQuery.contains("safe_metadata", { labels: [{ key: args.labelKey, value: args.labelValue }] });
		}
		applyFactFilters(dataQuery, args);
		const { data, error } = await dataQuery.range(offset, offset + ANALYTICS_FACT_PAGE_SIZE - 1);
        if (error) {
            throw new Error(error.message || "Failed to load v2 analytics request facts");
        }
        const page = (data ?? []) as AnalyticsFactRow[];
		rows.push(...page);
        if (page.length < ANALYTICS_FACT_PAGE_SIZE) break;
    }
    return rows;
}

function applyFactFilters(query: any, args: {
	keyId?: string | null;
	endUserId?: string | null;
	model?: string | null;
	providerModelIds?: string[] | null;
	endpoint?: string | null;
	byok?: boolean | null;
	success?: boolean | null;
}) {
	if (args.keyId) query.eq("key_id", args.keyId);
	if (args.endUserId) query.eq("end_user_id", args.endUserId);
	if (args.model) query.or(`requested_model_slug.eq.${args.model},routed_model_slug.eq.${args.model}`);
	if (args.providerModelIds?.length) query.in("provider_model_id", args.providerModelIds);
	if (args.endpoint) query.eq("endpoint", args.endpoint);
	if (args.byok !== null && args.byok !== undefined) query.eq("byok", args.byok);
	if (args.success !== null && args.success !== undefined) query.eq("success", args.success);
	return query;
}

async function loadProviderModelIds(provider: string | null): Promise<string[] | null> {
	if (!provider) return null;
	const { data, error } = await getSupabaseAdmin().from("v2_model_provider_routes").select("provider_model_id").eq("provider_slug", provider);
	if (error) throw new Error(error.message || "Failed to resolve analytics provider filter");
	return (data ?? []).map((row) => String(row.provider_model_id ?? "").trim()).filter(Boolean);
}

async function loadProviderNames(providerModelIds: string[]): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    if (providerModelIds.length === 0) return names;
    const supabase = getSupabaseAdmin();
    for (let offset = 0; offset < providerModelIds.length; offset += 200) {
        const { data, error } = await supabase
            .from("v2_model_provider_routes")
            .select("provider_model_id,provider_slug")
            .in("provider_model_id", providerModelIds.slice(offset, offset + 200));
        if (error) throw new Error(error.message || "Failed to load analytics provider names");
        for (const row of data ?? []) {
            if (row.provider_model_id && row.provider_slug) names.set(row.provider_model_id, row.provider_slug);
        }
    }
    return names;
}

// Display names come from the provider catalogue so analytics matches the website.
// A failed lookup only costs the nicer label, so fall back to the slug-derived name.
async function loadProviderDisplayNames(providerSlugs: string[]): Promise<Map<string, string>> {
	const names = new Map<string, string>();
	if (providerSlugs.length === 0) return names;
	const supabase = getSupabaseAdmin();
	for (let offset = 0; offset < providerSlugs.length; offset += 200) {
		const { data, error } = await supabase
			.from("v2_providers")
			.select("provider_slug,name")
			.in("provider_slug", providerSlugs.slice(offset, offset + 200));
		if (error) return names;
		for (const row of data ?? []) {
			const name = typeof row.name === "string" ? row.name.trim() : "";
			if (row.provider_slug && name) names.set(row.provider_slug, name);
		}
	}
	return names;
}

function meterQuantity(row: AnalyticsFactRow, keys: string[]): number {
    const wanted = new Set(keys);
    return (row.v2_request_usage ?? []).reduce((total, meter) => {
        return wanted.has(meter.meter_key ?? "") ? total + (toFiniteNumber(meter.quantity) ?? 0) : total;
    }, 0);
}

async function handleAnalytics(req: Request, options: { exportRequest?: boolean } = {}) {
	const auth = await guardAuth(req, { allowOAuthJwt: true });
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
	const labelKey = url.searchParams.get("label_key")?.trim() || null;
	const labelValue = url.searchParams.get("label_value")?.trim() || null;
	if ((labelKey && !labelValue) || (!labelKey && labelValue)) {
		return json({ ok: false, error: "invalid_request", message: "label_key and label_value must be provided together" }, 400, { "Cache-Control": "no-store" });
	}
	if (labelKey && (!/^[A-Za-z0-9_.:-]{1,64}$/.test(labelKey) || labelValue!.length > 256)) {
		return json({ ok: false, error: "invalid_request", message: "label_key or label_value is invalid" }, 400, { "Cache-Control": "no-store" });
	}
	const keyId = optionalFilter(url, "key_id", 128, /^[A-Za-z0-9_-]+$/);
	const endUserIdValue = url.searchParams.get("end_user_id")?.trim() || null;
	const endUserId = !endUserIdValue || endUserIdValue.length <= 256 ? endUserIdValue : false;
	const model = optionalFilter(url, "model", 256, /^[A-Za-z0-9_.:/-]+$/);
	const provider = optionalFilter(url, "provider", 128, /^[A-Za-z0-9_.-]+$/);
	const endpoint = optionalFilter(url, "endpoint", 128, /^[A-Za-z0-9_.:/-]+$/);
	const byok = optionalBoolean(url, "byok");
	const success = optionalBoolean(url, "success");
	if ([keyId, endUserId, model, provider, endpoint].includes(false) || (url.searchParams.has("byok") && byok === false && url.searchParams.get("byok")?.toLowerCase() !== "false") || (url.searchParams.has("success") && success === false && url.searchParams.get("success")?.toLowerCase() !== "false")) {
		return json({ ok: false, error: "invalid_request", message: "One or more analytics filters are invalid" }, 400, { "Cache-Control": "no-store" });
	}
	const offset = Number(url.searchParams.get("offset") ?? "0");
	const exportRequest = options.exportRequest === true;
	const limit = Number(url.searchParams.get("limit") ?? (exportRequest ? "10000" : "1000"));
	if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > (exportRequest ? 10_000 : 1_000)) {
		return json({ ok: false, error: "invalid_request", message: "Invalid pagination" }, 400, { "Cache-Control": "no-store" });
	}

	try {
		const providerFilterIds = await loadProviderModelIds(provider || null);
		if (providerFilterIds?.length === 0) return json({ data: [], total_count: 0, offset, limit }, 200, { "Cache-Control": "no-store" });
		const rows = await loadAnalyticsFactRows({
			workspaceId,
			startIso,
            endIso,
			labelKey,
			labelValue,
			keyId: keyId || null,
			endUserId: endUserId || null,
			model: model || null,
			providerModelIds: providerFilterIds,
			endpoint: endpoint || null,
			byok: byok as boolean | null,
			success: success as boolean | null,
        });
		const providerModelIds = Array.from(new Set(rows
			.map((row) => row.provider_model_id)
			.filter((value): value is string => Boolean(value))));
		const providerNames = await loadProviderNames(providerModelIds);
		const providerSlugs = new Set(providerModelIds.map((id) => providerNames.get(id) ?? id.split(":", 1)[0] ?? ""));
		const providerDisplayNames = await loadProviderDisplayNames(Array.from(providerSlugs).filter(Boolean));
		const grouped = new Map<string, {
			date: string;
			model: string;
			model_permaslug: string;
			endpoint_id: string;
			provider_name: string;
			usage: number;
			byok_usage_inference: number;
			requests: number;
			prompt_tokens: number;
			completion_tokens: number;
			reasoning_tokens: number;
		}>();
		for (const row of rows) {
			const date = toDayBucket(row.occurred_at?.slice(0, 10));
			if (!date) continue;
			const modelPermaslug = toNonEmptyString(row.routed_model_slug ?? row.requested_model_slug, "unknown/unknown");
			const providerModelId = toNonEmptyString(row.provider_model_id, "unknown");
			const providerId = providerNames.get(providerModelId) ?? providerModelId.split(":", 1)[0] ?? "unknown";
			const endpointId = toNonEmptyString(row.endpoint, "unknown");
			const key = `${date}\u0000${modelPermaslug}\u0000${providerModelId}\u0000${endpointId}`;
			const existing = grouped.get(key) ?? {
				date,
				model: toModelDisplay(modelPermaslug),
				model_permaslug: modelPermaslug,
				endpoint_id: endpointId,
				provider_name: providerDisplayNames.get(providerId) ?? toProviderName(providerId),
				usage: 0,
				byok_usage_inference: 0,
				requests: 0,
				prompt_tokens: 0,
				completion_tokens: 0,
				reasoning_tokens: 0,
			};
			const usage = toUsdFromNanos(toFiniteNumber(row.cost_nanos));
			existing.usage += usage;
			if (row.byok) existing.byok_usage_inference += usage;
			existing.requests += 1;
			existing.prompt_tokens += Math.max(0, Math.round(meterQuantity(row, ["input_tokens", "prompt_tokens"])));
			existing.completion_tokens += Math.max(0, Math.round(meterQuantity(row, ["output_tokens", "completion_tokens"])));
			existing.reasoning_tokens += Math.max(0, Math.round(meterQuantity(row, ["reasoning_tokens"])));
			grouped.set(key, existing);
		}

        const data = Array.from(grouped.values())
			.map((item) => ({
				...item,
				usage: toRoundedUsage(item.usage),
				byok_usage_inference: toRoundedUsage(item.byok_usage_inference),
			}))
            .sort((a, b) => {
                if (a.date !== b.date) return b.date.localeCompare(a.date);
                if (a.usage !== b.usage) return b.usage - a.usage;
                if (a.requests !== b.requests) return b.requests - a.requests;
                return a.model_permaslug.localeCompare(b.model_permaslug);
            });

		const totalCount = data.length;
        return json(
            { data: data.slice(offset, offset + limit), total_count: totalCount, offset, limit },
            200,
            { "Cache-Control": "no-store" }
        );
    } catch (error: any) {
        const factLimitExceeded = error instanceof AnalyticsFactLimitError;
        return json(
            {
                ok: false,
                error: factLimitExceeded ? "analytics_range_too_large" : "failed",
                message: String(error?.message ?? error),
            },
            factLimitExceeded ? 413 : 500,
            { "Cache-Control": "no-store" }
        );
    }
}

function csvCell(value: unknown): string {
	let text = value == null ? "" : String(value);
	if (/^[=+\-@]/.test(text)) text = `'${text}`;
	return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function handleAnalyticsExport(req: Request) {
	const url = new URL(req.url);
	url.searchParams.delete("offset");
	url.searchParams.delete("limit");
	const response = await handleAnalytics(new Request(url, { method: "GET", headers: req.headers }), { exportRequest: true });
	if (!response.ok) return response;
	const body = await response.json() as { data?: Array<Record<string, unknown>> };
	const columns = ["date", "model", "model_permaslug", "endpoint_id", "provider_name", "usage", "byok_usage_inference", "requests", "prompt_tokens", "completion_tokens", "reasoning_tokens"];
	const csv = [columns.join(","), ...(body.data ?? []).map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\r\n");
	return new Response(`${csv}\r\n`, {
		status: 200,
		headers: {
			"Content-Type": "text/csv; charset=utf-8",
			"Content-Disposition": `attachment; filename="phaseo-analytics-${new Date().toISOString().slice(0, 10)}.csv"`,
			"Cache-Control": "no-store",
		},
	});
}

export const analyticsRoutes = new Hono<Env>();

analyticsRoutes.get("/export", withRuntime(handleAnalyticsExport));
analyticsRoutes.get("/", withRuntime((req) => handleAnalytics(req)));

