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
        const path = (href.pathname || "/").replace(/\/+$/, "");
        return `${href.protocol}//${href.host}${path}`;
    } catch {
        return null;
    }
}

function hostFromUrl(u?: string | null): string | null {
    if (!u) return null;
    try {
        const parsed = new URL(u);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
        return parsed.host || null;
    } catch {
        return null;
    }
}

function slugify(s?: string | null): string | null {
    if (!s) return null;
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function normalizeAppId(input?: string | null): string | null {
    const value = String(input ?? "").trim().toLowerCase();
    if (!value) return null;
    const normalized = value
        .replace(/[^a-z0-9._:-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 64);
    return normalized || null;
}

function deriveIdentityUrl(appTitle?: string | null, referer?: string | null, appId?: string | null, appName?: string | null): string {
    const normalizedUrl = normaliseUrl(referer);
    if (normalizedUrl) return normalizedUrl;

    const normalizedAppId = normalizeAppId(appId);
    if (normalizedAppId) return `app://id/${normalizedAppId}`;

    const title = slugify(appName ?? appTitle ?? "");
    if (title) return `app://title/${title}`;

    return "about:blank";
}

/** Stable key for app attribution rows. */
function deriveAppKey(identityUrl: string): string {
    return identityUrl;
}

/** Upsert (team_id, app_key) → api_apps.id, updating title/url/meta/last_seen */
export async function ensureAppId(args: {
    teamId: string;
    appTitle?: string | null;
    referer?: string | null;
    appId?: string | null;
    appName?: string | null;
}): Promise<string | null> {
    const supabase = svc();
    const normalizedAppId = normalizeAppId(args.appId);
    const identityUrl = deriveIdentityUrl(args.appTitle, args.referer, args.appId, args.appName);
    const app_key = deriveAppKey(identityUrl);
    const title =
        args.appName ??
        args.appTitle ??
        hostFromUrl(identityUrl) ??
        (normalizedAppId ? `App ${normalizedAppId}` : "Unknown");
    const nowIso = new Date().toISOString();

    const payload = {
        team_id: args.teamId,
        app_key,
        title,
        url: identityUrl,
        is_active: true,
        last_seen: nowIso,
        updated_at: nowIso,
        meta: {
            referer: args.referer ?? null,
            appTitle: args.appTitle ?? null,
            appId: normalizedAppId ?? null,
            appName: args.appName ?? null,
            identityUrl,
        },
    };

    const findExistingId = async (): Promise<string | null> => {
        const { data, error } = await supabase
            .from("api_apps")
            .select("id")
            .eq("team_id", args.teamId)
            .eq("app_key", app_key)
            .order("last_seen", { ascending: false })
            .limit(1);
        if (error) {
            console.error("ensureAppId lookup error:", error);
            return null;
        }
        const first = Array.isArray(data) ? data[0] : null;
        return typeof first?.id === "string" ? first.id : null;
    };

    const existingId = await findExistingId();
    if (existingId) {
        const { error: updateError } = await supabase
            .from("api_apps")
            .update({
                title: payload.title,
                url: payload.url,
                is_active: true,
                last_seen: nowIso,
                updated_at: nowIso,
                meta: payload.meta,
            })
            .eq("id", existingId)
            .eq("team_id", args.teamId);
        if (updateError) {
            console.error("ensureAppId update error:", updateError);
        }
        return existingId;
    }

    const { data: inserted, error: insertError } = await supabase
        .from("api_apps")
        .insert(payload)
        .select("id")
        .single();

    if (!insertError && inserted?.id) {
        return inserted.id;
    }

    if (insertError) {
        const code = String((insertError as { code?: unknown } | null)?.code ?? "");
        if (code === "23505") {
            const racedId = await findExistingId();
            if (racedId) return racedId;
        }
        console.error("ensureAppId insert error:", insertError);
    }
    return null;
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










