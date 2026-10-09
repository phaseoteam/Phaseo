// src/lib/gateway/apps.ts
// Purpose: After-stage logic for payload shaping, pricing, auditing, and streaming.
// Why: Keeps post-execution side-effects consistent.
// How: Resolves app attribution and persists app metadata.

import { getSupabaseAdmin } from "@/runtime/env";
import { mergeAppCategories, normalizeAppCategories } from "./app-categories";
// Each miss costs a lookup plus an UPDATE of api_apps.last_seen, so keep known
// apps for a few minutes; new categories still bypass the cache.
const ENSURE_APP_ID_L1_TTL_MS = 5 * 60_000;
const ENSURE_APP_ID_L1_MAX_ENTRIES = 5_000;

type EnsureAppIdCacheEntry = {
	id: string;
	categories: string[];
	expiresAtMs: number;
};

const ensureAppIdL1 = new Map<string, EnsureAppIdCacheEntry>();
const ensureAppIdInflight = new Map<string, Promise<string | null>>();

export function normalizeAppAttributionText(
	value: string | null | undefined,
	maxLength = 2_048,
): string | null {
	const normalized = String(value ?? "").replace(/\u0000/g, "").trim();
	if (!normalized) return null;
	return normalized.slice(0, maxLength);
}

function ensureAppIdCacheKey(workspaceId: string, appKey: string): string {
	return `${workspaceId}:${appKey}`;
}

function readEnsureAppIdL1(cacheKey: string): EnsureAppIdCacheEntry | undefined {
	const entry = ensureAppIdL1.get(cacheKey);
	if (!entry) return undefined;
	if (entry.expiresAtMs <= Date.now()) {
		ensureAppIdL1.delete(cacheKey);
		return undefined;
	}
	return entry;
}

function writeEnsureAppIdL1(
	cacheKey: string,
	id: string,
	categories: string[] = [],
	ttlMs = ENSURE_APP_ID_L1_TTL_MS,
): void {
	if (!Number.isFinite(ttlMs) || ttlMs <= 0) return;
	ensureAppIdL1.delete(cacheKey);
	ensureAppIdL1.set(cacheKey, {
		id,
		categories,
		expiresAtMs: Date.now() + ttlMs,
	});
	while (ensureAppIdL1.size > ENSURE_APP_ID_L1_MAX_ENTRIES) {
		const oldest = ensureAppIdL1.keys().next();
		if (oldest.done) break;
		ensureAppIdL1.delete(oldest.value);
	}
}

export function __resetEnsureAppIdCacheForTests(): void {
	ensureAppIdL1.clear();
	ensureAppIdInflight.clear();
}

function normalizeUrl(input?: string | null): string | null {
    if (!input) return null;
    try {
        const u = new URL(input);
        if (u.protocol !== "http:" && u.protocol !== "https:") return null;
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
        return parsed.hostname.replace(/^www\./i, "") || null;
    } catch {
        return null;
    }
}

function normalizeAppLabel(input?: string | null): string | null {
    const trimmed = String(input ?? "").trim();
    if (!trimmed) return null;

    const normalized = trimmed
        .toLowerCase()
        .replace(/[?.!]+$/g, "")
        .replace(/\s+/g, " ")
        .trim();

    if (
        normalized === "unknown" ||
        normalized === "unknown app" ||
        normalized === "app" ||
        normalized === "untitled" ||
        normalized === "n/a" ||
        normalized === "na" ||
        normalized === "none" ||
        normalized === "null" ||
        normalized === "undefined"
    ) {
        return null;
    }

    return trimmed;
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
	if (["app", "unknown", "unknown-app", "untitled", "none", "null", "undefined"].includes(value)) {
		return null;
	}
    const normalized = value
        .replace(/[^a-z0-9._:-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 64);
    if (["app", "unknown", "unknown-app", "untitled", "none", "null", "undefined", "n-a", "na"].includes(normalized)) {
        return null;
    }
    return normalized || null;
}

function deriveIdentityUrl(args: {
    referer?: string | null;
    appId?: string | null;
    appTitle?: string | null;
    appName?: string | null;
}): string | null {
    const urlFromReferer = normalizeUrl(args.referer);
    if (urlFromReferer) return urlFromReferer;

    const normalizedAppId = normalizeAppId(args.appId);
    if (normalizedAppId) return `app://id/${normalizedAppId}`;

    const titleSlug = slugify(
		normalizeAppLabel(args.appName) ?? normalizeAppLabel(args.appTitle) ?? "",
	);
    if (titleSlug) return `app://title/${titleSlug}`;

    return null;
}

function deriveAppKey(identityUrl: string): string {
    return identityUrl;
}

function deriveInferredTitle(args: {
    appName?: string | null;
    appTitle?: string | null;
    identityUrl: string;
    normalizedAppId?: string | null;
}): string {
    const explicitTitle =
        normalizeAppLabel(args.appName) ?? normalizeAppLabel(args.appTitle);
    if (explicitTitle) return explicitTitle;

    const hostTitle = hostFromUrl(args.identityUrl);
    if (hostTitle) return hostTitle;

    if (args.normalizedAppId) return `App ${args.normalizedAppId}`;
    return "App";
}

/**
 * Resolve or create an app row for logging.
 */
export async function resolveAppIdForLogging(args: {
    workspaceId: string;
    appTitle?: string | null;
    referer?: string | null;
    appId?: string | null;
    appName?: string | null;
    appCategories?: string | null;
}): Promise<string | null> {
    return ensureAppId(args);
}

export async function ensureAppId(params: {
    workspaceId: string;
    appTitle?: string | null;
    referer?: string | null;
    appId?: string | null;
    appName?: string | null;
    appCategories?: string | null;
}): Promise<string | null> {
    const { workspaceId, appTitle, referer, appId, appName, appCategories } = params;
    const normalizedAppId = normalizeAppId(appId);
    const identityUrl = deriveIdentityUrl({ referer, appId, appTitle, appName });
	if (!identityUrl) return null;
    const app_key = deriveAppKey(identityUrl);
    const cacheKey = ensureAppIdCacheKey(workspaceId, app_key);
    const requestedCategories = normalizeAppCategories(appCategories);
    const cached = readEnsureAppIdL1(cacheKey);
    if (cached && requestedCategories.every((category) => cached.categories.includes(category))) {
        return cached.id;
    }

    const inflight = ensureAppIdInflight.get(cacheKey);
    if (inflight) {
        await inflight;
        return ensureAppId({ workspaceId, appTitle, referer, appId, appName, appCategories });
    }

    const loader = (async (): Promise<string | null> => {
        const supabase = getSupabaseAdmin();
        const nowIso = new Date().toISOString();
        const inferredTitle = deriveInferredTitle({
            appName,
            appTitle,
            identityUrl,
            normalizedAppId,
        });
        const payload = {
            workspace_id: workspaceId,
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

        const findExisting = async (): Promise<{ id: string; category: string | null; managementOverrides: Set<string> } | null> => {
            const { data, error } = await supabase
                .from("api_apps")
                .select("id,category,meta")
                .eq("workspace_id", workspaceId)
                .eq("app_key", app_key)
                .order("last_seen", { ascending: false })
                .limit(1);
            if (error) {
                console.error("ensureAppId lookup error:", error);
                return null;
            }
            const first = Array.isArray(data) ? data[0] : null;
            return typeof first?.id === "string"
                ? {
                    id: first.id,
                    category: typeof first.category === "string" ? first.category : null,
                    managementOverrides: new Set(
                        Array.isArray((first.meta as Record<string, unknown> | null)?.management_overrides)
                            ? ((first.meta as Record<string, unknown>).management_overrides as unknown[]).map(String)
                            : [],
                    ),
                }
                : null;
        };

        const existing = await findExisting();
        if (existing) {
            const category = mergeAppCategories(existing.category, requestedCategories.join(","));
            const { error: updateError } = await supabase
                .from("api_apps")
                .update({
                    ...(!existing.managementOverrides.has("title") ? { title: payload.title } : {}),
                    ...(!existing.managementOverrides.has("url") ? { url: payload.url } : {}),
                    ...(!existing.managementOverrides.has("is_active") ? { is_active: true } : {}),
                    last_seen: nowIso,
                    updated_at: nowIso,
                    meta: { ...payload.meta, management_overrides: [...existing.managementOverrides] },
                    ...(category && !existing.managementOverrides.has("category") ? { category } : {}),
                })
                .eq("id", existing.id)
                .eq("workspace_id", workspaceId);
            if (updateError) {
                console.error("ensureAppId update error:", updateError);
            }
            writeEnsureAppIdL1(cacheKey, existing.id, normalizeAppCategories(category));
            return existing.id;
        }

        const { data: inserted, error: insertError } = await supabase
            .from("api_apps")
            .insert({
                ...payload,
                ...(requestedCategories.length ? { category: requestedCategories.join(",") } : {}),
            })
            .select("id")
            .single();

        if (!insertError && inserted?.id) {
            writeEnsureAppIdL1(cacheKey, inserted.id, requestedCategories);
            return inserted.id;
        }

        if (insertError) {
            const code = String((insertError as { code?: unknown } | null)?.code ?? "");
            if (code === "23505") {
                const raced = await findExisting();
                if (raced) {
                    const category = mergeAppCategories(raced.category, requestedCategories.join(","));
                    if (category !== raced.category) {
                        await supabase
                            .from("api_apps")
                            .update({ category, updated_at: nowIso })
                            .eq("id", raced.id)
                            .eq("workspace_id", workspaceId);
                    }
                    writeEnsureAppIdL1(cacheKey, raced.id, normalizeAppCategories(category));
                    return raced.id;
                }
            }
            console.error("ensureAppId insert error:", insertError);
        }
        return null;
    })();

    ensureAppIdInflight.set(cacheKey, loader);
    try {
        return await loader;
    } finally {
        if (ensureAppIdInflight.get(cacheKey) === loader) {
            ensureAppIdInflight.delete(cacheKey);
        }
    }
}







