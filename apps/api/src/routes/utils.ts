// Purpose: Route handler module.
// Why: Keeps HTTP wiring separate from pipeline logic.
// How: Maps requests to pipeline entrypoints and responses.

import type { Context } from "hono";
import type { GatewayBindings } from "@/runtime/env";
import { configureRuntime, setWaitUntil, clearRuntime, getBindings, dispatchBackground } from "@/runtime/env";
import { sanitizeRequestHeaders } from "@pipeline/http/sanitize-headers";

type Handler = (req: Request) => Promise<Response>;
type CacheOptions = {
    scope: string;
    ttlSeconds: number;
    staleSeconds?: number;
    varyHeaders?: string[];
};

const encoder = new TextEncoder();
const CACHE_REVALIDATE_HEADER = "x-aistats-cache-revalidate";
const CACHE_REVALIDATE_QUERY_PARAM = "cache_revalidate";
const CACHE_CREATED_AT_HEADER = "x-aistats-cache-created-at";
const REVALIDATION_DEDUPE_WINDOW_MS = 15_000;
const revalidationLocks = new Map<string, number>();

function looksLikeStackTrace(value: string): boolean {
    return /\n\s*at\s+[^\n]+/i.test(value) || /Error:\s*[^\n]+/i.test(value);
}

function stringifyJsonBody(body: unknown): string {
    const seen = new WeakSet<object>();
    return JSON.stringify(
        body,
        (key, value) => {
            if (key === "stack" || key === "stackTrace" || key === "stacktrace") {
                return undefined;
            }
            if (value instanceof Error) {
                return {
                    name: value.name,
                };
            }
            if (typeof value === "string" && looksLikeStackTrace(value)) {
                return "[redacted]";
            }
            if (typeof value === "object" && value !== null) {
                if (seen.has(value)) return "[Circular]";
                seen.add(value);
            }
            return value;
        },
        2
    );
}

export function withRuntime(handler: Handler) {
    return async (c: Context<{ Bindings: GatewayBindings }>) => {
        configureRuntime(c.env);
        const waitUntil = c.executionCtx?.waitUntil?.bind(c.executionCtx);
        const releaseWaitUntil = setWaitUntil(waitUntil);
        const sanitized = sanitizeRequestHeaders(c.req.raw, { preserve: ["authorization"] });
        try {
            return await handler(sanitized);
        } finally {
            releaseWaitUntil();
            clearRuntime();
        }
    };
}

export function json(body: any, status = 200, headers: Record<string, string> = {}) {
    // lgtm[js/stack-trace-exposure]
    // Stack-like content is stripped in stringifyJsonBody before response serialization.
    return new Response(stringifyJsonBody(body), {
        status,
        headers: {
            "Content-Type": "application/json",
            ...headers,
        },
    });
}

function toBase64Url(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hashCacheScope(scope: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", encoder.encode(scope));
    return toBase64Url(new Uint8Array(digest));
}

async function buildCacheKey(req: Request, scope: string): Promise<Request> {
    const url = new URL(req.url);
    // Remove cache-control query params so forced refreshes target the same key.
    url.searchParams.delete(CACHE_REVALIDATE_QUERY_PARAM);
    url.searchParams.delete("__cache_scope");
    const scopeHash = await hashCacheScope(scope);
    url.searchParams.set("__cache_scope", scopeHash);
    return new Request(url.toString(), { method: "GET" });
}

async function buildRouteLockKey(req: Request, scope: string): Promise<string> {
    const cacheKey = await buildCacheKey(req, scope);
    const digest = await crypto.subtle.digest("SHA-256", encoder.encode(cacheKey.url));
    return toBase64Url(new Uint8Array(digest));
}

type CacheFreshness = "fresh" | "stale";

type CachedReadResult = {
    response: Response;
    freshness: CacheFreshness;
    lockKey: string;
};

function isTruthyFlag(value: string | null | undefined): boolean {
    if (!value) return false;
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function timingSafeEqual(a: string, b: string): boolean {
    const len = Math.max(a.length, b.length);
    let diff = a.length === b.length ? 0 : 1;
    for (let i = 0; i < len; i++) {
        const ca = i < a.length ? a.charCodeAt(i) : 0;
        const cb = i < b.length ? b.charCodeAt(i) : 0;
        diff |= ca ^ cb;
    }
    return diff === 0;
}

function isCacheRevalidateAuthorized(req: Request): boolean {
    const bindings = getBindings();
    const configured = [
        String(bindings.GATEWAY_CONTROL_SECRET ?? "").trim(),
        String(bindings.GATEWAY_INTERNAL_TEST_TOKEN ?? "").trim(),
    ].filter((value) => value.length > 0);
    if (!configured.length) return false;

    const provided = [
        req.headers.get("x-control-secret"),
        req.headers.get("x-aistats-internal-token"),
        req.headers.get("x-ai-stats-internal-token"),
        req.headers.get("x-internal-token"),
    ]
        .map((value) => String(value ?? "").trim())
        .filter((value) => value.length > 0);
    if (!provided.length) return false;

    for (const expected of configured) {
        for (const got of provided) {
            if (timingSafeEqual(got, expected)) return true;
        }
    }
    return false;
}

export function isCacheRevalidateRequested(req: Request): boolean {
    const headerRequested = isTruthyFlag(req.headers.get(CACHE_REVALIDATE_HEADER));
    const url = new URL(req.url);
    const queryRequested = isTruthyFlag(url.searchParams.get(CACHE_REVALIDATE_QUERY_PARAM));
    if (!headerRequested && !queryRequested) return false;
    return isCacheRevalidateAuthorized(req);
}

export function cacheHeaders(options: CacheOptions): Record<string, string> {
    const stale = options.staleSeconds ?? 0;
    const cacheControl = [
        "private",
        `max-age=${options.ttlSeconds}`,
        stale > 0 ? `stale-while-revalidate=${stale}` : null,
    ].filter(Boolean).join(", ");
    if (options.varyHeaders === undefined) {
        return {
            "Cache-Control": cacheControl,
            "Vary": "Authorization",
        };
    }
    if (options.varyHeaders.length === 0) {
        return {
            "Cache-Control": cacheControl,
        };
    }
    return {
        "Cache-Control": cacheControl,
        "Vary": options.varyHeaders.join(", "),
    };
}

function parseCachedAtMs(raw: string | null | undefined): number | null {
    if (!raw) return null;
    const asNumber = Number(raw);
    if (Number.isFinite(asNumber) && asNumber > 0) return asNumber;
    const asDate = Date.parse(raw);
    if (Number.isFinite(asDate) && asDate > 0) return asDate;
    return null;
}

function classifyFreshness(cachedAtMs: number | null, options: CacheOptions, nowMs: number): CacheFreshness | null {
    if (!cachedAtMs) return "fresh";
    const ageMs = Math.max(0, nowMs - cachedAtMs);
    const freshMs = Math.max(0, options.ttlSeconds * 1000);
    if (ageMs <= freshMs) return "fresh";
    const staleMs = Math.max(0, (options.staleSeconds ?? 0) * 1000);
    if (staleMs > 0 && ageMs <= freshMs + staleMs) return "stale";
    return null;
}

function decorateCacheOutcome(response: Response, outcome: "HIT" | "MISS" | "STALE" | "REVALIDATED"): Response {
    const headers = new Headers(response.headers);
    headers.set("X-AIStats-Cache", outcome);
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

async function persistCachedResponse(req: Request, response: Response, options: CacheOptions): Promise<Response> {
    if (req.method !== "GET") return response;
    if (!response.ok) return response;
    const nowMs = Date.now();
    const cache = (caches as unknown as { default: Cache }).default;
    const cacheKey = await buildCacheKey(req, options.scope);
    const headers = new Headers(response.headers);
    if (!headers.has(CACHE_CREATED_AT_HEADER)) {
        headers.set(CACHE_CREATED_AT_HEADER, String(nowMs));
    }
    const decorated = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
    try {
        await cache.put(cacheKey, decorated.clone());
    } catch {
        // ignore Cache API write failures
    }
    return decorated;
}

async function readCachedResponseWithMeta(req: Request, options: CacheOptions): Promise<CachedReadResult | null> {
    if (req.method !== "GET") return null;
    if (isCacheRevalidateRequested(req)) return null;
    const nowMs = Date.now();
    const cache = (caches as unknown as { default: Cache }).default;
    try {
        const cacheKey = await buildCacheKey(req, options.scope);
        const lockKey = await buildRouteLockKey(req, options.scope);
        const cached = await cache.match(cacheKey);
        if (cached) {
            const cachedAtMs = parseCachedAtMs(cached.headers.get(CACHE_CREATED_AT_HEADER));
            const freshness = classifyFreshness(cachedAtMs, options, nowMs);
            if (!freshness) return null;
            const decorated = decorateCacheOutcome(
                new Response(cached.body, {
                    status: cached.status,
                    statusText: cached.statusText,
                    headers: cached.headers,
                }),
                freshness === "fresh" ? "HIT" : "STALE"
            );
            return {
                response: decorated,
                freshness,
                lockKey,
            };
        }
    } catch {
        // treat cache read failures as a miss
        return null;
    }
}

function shouldStartRevalidation(lockKey: string): boolean {
    const now = Date.now();
    const existing = revalidationLocks.get(lockKey);
    if (typeof existing === "number" && now - existing < REVALIDATION_DEDUPE_WINDOW_MS) {
        return false;
    }
    revalidationLocks.set(lockKey, now);
    return true;
}

export async function readCachedResponse(req: Request, options: CacheOptions): Promise<Response | null> {
    const cached = await readCachedResponseWithMeta(req, options);
    return cached?.response ?? null;
}

export async function cacheResponse(req: Request, response: Response, options: CacheOptions): Promise<Response> {
    if (req.method !== "GET") return response;
    if (!response.ok) return response;
    const persisted = await persistCachedResponse(req, response, options);
    return decorateCacheOutcome(
        persisted,
        isCacheRevalidateRequested(req) ? "REVALIDATED" : "MISS"
    );
}

export async function respondWithCache(
    req: Request,
    options: CacheOptions,
    produce: () => Promise<Response>
): Promise<Response> {
    if (req.method !== "GET") {
        return produce();
    }

    const forcedRevalidate = isCacheRevalidateRequested(req);
    if (!forcedRevalidate) {
        const cached = await readCachedResponseWithMeta(req, options);
        if (cached) {
            if (cached.freshness === "stale" && shouldStartRevalidation(cached.lockKey)) {
                const lockKey = cached.lockKey;
                dispatchBackground((async () => {
                    try {
                        const fresh = await produce();
                        if (!fresh.ok) return;
                        await persistCachedResponse(req, fresh, options);
                    } finally {
                        revalidationLocks.delete(lockKey);
                    }
                })());
            }
            return cached.response;
        }
    }

    const fresh = await produce();
    return cacheResponse(req, fresh, options);
}

export function withCors(
    handler: Parameters<typeof withRuntime>[0]
) {
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers":
            "Authorization,Content-Type,x-title,http-referer,x-app-id,x-app-name,x-gateway-debug,X-AIStats-Strictness,x-aistats-cache-revalidate",
        "Access-Control-Max-Age": "86400",
    };

    return async (c: Parameters<ReturnType<typeof withRuntime>>[0]) => {
        if (c.req.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: corsHeaders });
        }
        const response = await withRuntime(handler)(c);
        const headers = new Headers(response.headers);
        for (const [key, value] of Object.entries(corsHeaders)) {
            headers.set(key, value);
        }
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
        });
    };
}

