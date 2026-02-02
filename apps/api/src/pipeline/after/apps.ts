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

function normaliseUrl(u?: string | null): string | null {
    if (!u) return null;
    try { return new URL(u).toString(); } catch { return u; }
}
function hostFromUrl(u?: string | null): string | null {
    if (!u) return null;
    try { return new URL(u).host || null; } catch { return null; }
}

function deriveAppKey(appTitle?: string | null, referer?: string | null): string | null {
    const host = hostFromUrl(referer);
    const title = slugify(appTitle ?? "");
    if (title && host) return `${title}@${host}`;
    if (title) return title;
    if (host) return `@${host}`;
    return null;
}

function hostOf(input?: string | null): string {
    try { return input ? new URL(input).host.replace(/^www\./, "") : ""; } catch { return ""; }
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
function rand6() { return Math.random().toString(36).slice(2, 8); }

async function findByUrl(teamId: string, urlNorm: string) {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
        .from("data_api_apps").select("id").eq("team_id", teamId).eq("url", urlNorm).maybeSingle();
    return data as { id: string } | null;
}

async function findByTitle(teamId: string, title: string) {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
        .from("data_api_apps").select("id").eq("team_id", teamId).ilike("title", title).maybeSingle();
    return data as { id: string } | null;
}

async function upsertByKey(teamId: string, appKey: string, title: string, urlNorm: string | null) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
        .from("data_api_apps")
        .upsert([{
            team_id: teamId,
            app_key: appKey,
            title,
            url: urlNorm ?? "",
            last_seen: new Date().toISOString(),
        }], { onConflict: "team_id,app_key" })
        .select("id")
        .single();
    if (error) { console.error("[apps] upsert failed", error); return null; }
    return (data?.id as string) ?? null;
}

/**
 * Resolve or create an app row for (team, title, referer).
 * No header key needed yet. Used *only* in logging.
 */
export async function resolveAppIdForLogging(args: {
    teamId: string;
    appTitle?: string | null;
    referer?: string | null;
}): Promise<string | null> {
    const title = (args.appTitle ?? "").trim();
    const urlNorm = normalizeUrl(args.referer);
    const host = hostOf(urlNorm);

    // 1) match by URL
    if (urlNorm) {
        const found = await findByUrl(args.teamId, urlNorm);
        if (found?.id) return found.id;
    }
    // 2) match by Title
    if (title) {
        const found = await findByTitle(args.teamId, title);
        if (found?.id) return found.id;
    }

    // 3) create with generated key (title-host-rand)
    const base = [slugify(title) || "app", slugify(host) || "host"].join("-");
    const genKey = `${base}-${rand6()}`;
    const id = await upsertByKey(args.teamId, genKey, title || base, urlNorm);
    return id;
}

export async function ensureAppId(params: {
    teamId: string;
    appTitle?: string | null;
    referer?: string | null;
}): Promise<string | null> {
    const { teamId, appTitle, referer } = params;
    const app_key = deriveAppKey(appTitle, referer);
    if (!app_key) return null;

    const supabase = getSupabaseAdmin();
    const nowIso = new Date().toISOString();
    const payload = {
        team_id: teamId,
        app_key,
        title: appTitle ?? hostFromUrl(referer) ?? "Unknown",
        url: normaliseUrl(referer) ?? "about:blank",
        is_active: true,
        last_seen: nowIso,
        updated_at: nowIso,
        meta: { referer: referer ?? null, appTitle: appTitle ?? null },
    };

    const { data, error } = await supabase
        .from("api_apps")
        .upsert(payload, { onConflict: "team_id,app_key" })
        .select("id")
        .single();

    if (error) {
        console.error("ensureAppId error:", error);
        return null;
    }
    return data?.id ?? null;
}










