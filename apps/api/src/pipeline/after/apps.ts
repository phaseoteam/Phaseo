// src/lib/gateway/apps.ts
// Purpose: After-stage logic for payload shaping, pricing, auditing, and streaming.
// Why: Keeps post-execution side-effects consistent.
// How: Resolves app attribution and persists app metadata.

import { getSupabaseAdmin } from "@/runtime/env";

function normalizeUrl(input?: string | null): string | null {
    if (!input) return null;
    try {
        const u = new URL(input);
        const path = (u.pathname || "/").replace(/\/+$/, "");
        return `${u.protocol}//${u.host}${path}`;
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

function slugify(s?: string | null): string {
    if (!s) return "";
    return s
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);
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

function deriveIdentityUrl(args: {
    referer?: string | null;
    appId?: string | null;
    appTitle?: string | null;
    appName?: string | null;
}): string {
    const urlFromReferer = normalizeUrl(args.referer);
    if (urlFromReferer) return urlFromReferer;

    const normalizedAppId = normalizeAppId(args.appId);
    if (normalizedAppId) return `app://id/${normalizedAppId}`;

    const titleSlug = slugify(args.appName ?? args.appTitle ?? "");
    if (titleSlug) return `app://title/${titleSlug}`;

    return "about:blank";
}

function deriveAppKey(identityUrl: string): string {
    return identityUrl;
}

/**
 * Resolve or create an app row for logging.
 */
export async function resolveAppIdForLogging(args: {
    teamId: string;
    appTitle?: string | null;
    referer?: string | null;
    appId?: string | null;
    appName?: string | null;
}): Promise<string | null> {
    return ensureAppId(args);
}

export async function ensureAppId(params: {
    teamId: string;
    appTitle?: string | null;
    referer?: string | null;
    appId?: string | null;
    appName?: string | null;
}): Promise<string | null> {
    const { teamId, appTitle, referer, appId, appName } = params;
    const normalizedAppId = normalizeAppId(appId);
    const identityUrl = deriveIdentityUrl({ referer, appId, appTitle, appName });
    const app_key = deriveAppKey(identityUrl);

    const supabase = getSupabaseAdmin();
    const nowIso = new Date().toISOString();
    const inferredTitle =
        appName ??
        appTitle ??
        hostFromUrl(identityUrl) ??
        (normalizedAppId ? `App ${normalizedAppId}` : "Unknown");
    const payload = {
        team_id: teamId,
        app_key,
        title: inferredTitle,
        url: identityUrl,
        is_active: true,
        last_seen: nowIso,
        updated_at: nowIso,
        meta: {
            referer: referer ?? null,
            appTitle: appTitle ?? null,
            appId: normalizedAppId ?? null,
            appName: appName ?? null,
            identityUrl,
        },
    };

    const findExistingId = async (): Promise<string | null> => {
        const { data, error } = await supabase
            .from("api_apps")
            .select("id")
            .eq("team_id", teamId)
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
            .eq("team_id", teamId);
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










