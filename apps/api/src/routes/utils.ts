// Purpose: Route handler module.
// Why: Keeps HTTP wiring separate from pipeline logic.
// How: Maps requests to pipeline entrypoints and responses.

import type { Context } from "hono";
import type { GatewayBindings } from "@/runtime/env";
import { configureRuntime, setWaitUntil, clearRuntime, dispatchBackground } from "@/runtime/env";
import { sanitizeRequestHeaders } from "@pipeline/http/sanitize-headers";

type Handler = (req: Request) => Promise<Response>;
type CacheOptions = {
    scope: string;
    ttlSeconds: number;
    staleSeconds?: number;
    varyHeaders?: string[];
};

const encoder = new TextEncoder();

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
    return new Response(JSON.stringify(body, null, 2), {
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
    const scopeHash = await hashCacheScope(scope);
    url.searchParams.set("__cache_scope", scopeHash);
    return new Request(url.toString(), { method: "GET" });
}

export function cacheHeaders(options: CacheOptions): Record<string, string> {
    const stale = options.staleSeconds ?? 0;
    const cacheControl = [
        "private",
        `max-age=${options.ttlSeconds}`,
        stale > 0 ? `stale-while-revalidate=${stale}` : null,
    ].filter(Boolean).join(", ");
    const vary = options.varyHeaders?.length ? options.varyHeaders.join(", ") : "Authorization";
    return {
        "Cache-Control": cacheControl,
        "Vary": vary,
    };
}

export async function cacheResponse(req: Request, response: Response, options: CacheOptions): Promise<Response> {
    if (req.method !== "GET") return response;
    if (!response.ok) return response;
    const cache = (caches as unknown as { default: Cache }).default;
    const cacheKey = await buildCacheKey(req, options.scope);
    dispatchBackground(cache.put(cacheKey, response.clone()));
    return response;
}

export function withCors(
    handler: Parameters<typeof withRuntime>[0]
) {
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers":
            "Authorization,Content-Type,x-title,http-referer,x-gateway-debug,X-AIStats-Strictness",
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

