// src/lib/gateway/audit/database.ts
// Purpose: Persist audits and send analytics events.
// Why: Ensures observability for every request.
// How: Database helpers for audit persistence.


import { getSupabaseAdmin } from "@/runtime/env";
import type { Endpoint } from "@core/types";

export type PersistArgs = {
    requestId: string;
    teamId: string;

    // identity
    provider: string;
    model: string;
    endpoint: Endpoint;
    nativeResponseId?: string | null;

    // app hints
    appTitle?: string | null;
    referer?: string | null;

    // request context
    stream: boolean;
    isByok: boolean;

    // timings
    generationMs: number;   // adapter/provider time
    latencyMs: number;      // end-to-end

    // usage & money
    usagePriced: any;       // your computeBill(...) output (meters + pricing)
    totalCents: number;
    currency: "USD";

    // completion
    finishReason?: string | null;
};

function svc() {
    return getSupabaseAdmin();
}

function normaliseUrl(u?: string | null): string | null {
    if (!u) return null;
    try {
        const href = new URL(u);
        return href.toString();
    } catch {
        // If not a valid URL, store as-is (you made url NOT NULL, so fall back later)
        return u;
    }
}

function hostFromUrl(u?: string | null): string | null {
    if (!u) return null;
    try {
        return new URL(u).host || null;
    } catch {
        return null;
    }
}

function slugify(s?: string | null): string | null {
    if (!s) return null;
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Stable key for (team_id, app_key) */
function deriveAppKey(appTitle?: string | null, referer?: string | null): string | null {
    const host = hostFromUrl(referer);
    const title = slugify(appTitle ?? "");
    if (title && host) return `${title}@${host}`;
    if (title) return title;
    if (host) return `@${host}`;
    return null;
}

/** Upsert (team_id, app_key) → api_apps.id, updating title/url/meta/last_seen */
export async function ensureAppId(args: {
    teamId: string;
    appTitle?: string | null;
    referer?: string | null;
}): Promise<string | null> {
    const supabase = svc();
    const app_key = deriveAppKey(args.appTitle, args.referer);
    if (!app_key) return null;

    const url = normaliseUrl(args.referer) ?? "about:blank";
    const title = args.appTitle ?? hostFromUrl(args.referer) ?? "Unknown";
    const nowIso = new Date().toISOString();

    const payload = {
        team_id: args.teamId,
        app_key,
        title,
        url,
        is_active: true,
        last_seen: nowIso,
        updated_at: nowIso,
        meta: { referer: args.referer ?? null, appTitle: args.appTitle ?? null },
    };

    const { data, error } = await supabase
        .from("api_apps")
        .upsert(payload, { onConflict: "team_id,app_key" })
        .select("id")
        .single();

    if (error) {
        console.error("ensureAppId upsert error:", error);
        return null;
    }
    return data?.id ?? null;
}

/** Insert or upsert a generation row (idempotent on team_id+request_id). */
async function upsertGeneration(args: PersistArgs & { appId?: string | null }) {
    const supabase = svc();

    const row = {
        request_id: args.requestId,
        team_id: args.teamId,

        provider: args.provider,
        model_id: args.model,
        endpoint: args.endpoint,
        app_id: args.appId ?? null,
        api_type: args.endpoint,
        stream: !!args.stream,
        is_byok: !!args.isByok,

        generation_ms: Math.max(0, Math.round(args.generationMs || 0)),
        latency_ms: Math.max(0, Math.round(args.latencyMs || 0)),

        usage: normalizeUsageTokens(args.usagePriced ?? {}),
        usage_cents_text: String(args.totalCents ?? 0),
        currency: args.currency,

        finish_reason: args.finishReason ?? null,

        // Optional convenience fields (add column if you want):
        // native_response_id: args.nativeResponseId ?? null,
    };

    const { error } = await supabase
        .from("gateway_generations")
        .upsert(row, { onConflict: "team_id,request_id" });

    if (error) {
        console.error("gateway_generations upsert error:", error, { row });
    }
}

/** Public: persist generation (app upsert + generation upsert) */
export async function persistGenerationToSupabase(args: PersistArgs) {
    try {
        const appId = await ensureAppId({
            teamId: args.teamId,
            appTitle: args.appTitle ?? null,
            referer: args.referer ?? null,
        });

        await upsertGeneration({ ...args, appId });
    } catch (err) {
        console.error("persistGenerationToSupabase fatal:", err);
    }
}
// Lightweight normalization: recompute total_tokens from present token fields
const CANONICAL_KEYS: Record<string, string> = {
    input_text_tokens: "input_text_tokens",
    input_tokens: "input_text_tokens",
    prompt_tokens: "input_text_tokens",
    output_text_tokens: "output_text_tokens",
    output_tokens: "output_text_tokens",
    completion_tokens: "output_text_tokens",
    reasoning_tokens: "reasoning_tokens",
    cached_read_text_tokens: "cached_read_text_tokens",
};
function tokenBreakdown(usage: any): Record<string, number> {
    const acc = new Map<string, number>();
    if (Array.isArray(usage)) {
        for (const u of usage) {
            const sub = tokenBreakdown(u);
            for (const [k, v] of Object.entries(sub)) {
                acc.set(k, (acc.get(k) ?? 0) + v);
            }
        }
        return Object.fromEntries(acc);
    }
    if (!usage || typeof usage !== 'object') return {};
    for (const [rawKey, rawVal] of Object.entries(usage)) {
        const lk = rawKey.toLowerCase();
        if (!lk.includes('token')) continue;
        if (lk === 'total_tokens') continue;
        const n = Number(rawVal);
        if (!Number.isFinite(n) || n <= 0) continue;
        const canonical = CANONICAL_KEYS[lk] ?? rawKey;
        const prev = acc.get(canonical) ?? 0;
        acc.set(canonical, Math.max(prev, n));
    }
    return Object.fromEntries(acc);
}
function normalizeUsageTokens(usage: any) {
    try {
        const total = Object.values(tokenBreakdown(usage)).reduce((s, v) => s + v, 0);
        return { ...(usage ?? {}), total_tokens: total };
    } catch {
        return usage;
    }
}










