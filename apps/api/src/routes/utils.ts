import type { Context } from "hono";
import type { GatewayBindings } from "@/runtime/env";
import { configureRuntime, setWaitUntil, clearRuntime } from "@/runtime/env";
import { sanitizeRequestHeaders } from "@pipeline/http/sanitize-headers";

type Handler = (req: Request) => Promise<Response>;

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
