// src/routes/v1/index.ts
// Purpose: Aggregate v1 route groups (inference + platform).
// Why: Centralizes API version routing.
// How: Wires HTTP routes to pipeline entrypoints and response helpers.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";

import { inferenceRouter } from "./data";
import { lazyRouter } from "@/routes/lazy";
import { EXPOSED_UPSTREAM_RATE_LIMIT_HEADERS } from "@/pipeline/upstream-rate-limit-headers";
import { isSyntheticKey, requestStateEnabled } from "@core/request-state/client";

export const v1Router = new Hono<Env>();

// Synthetic allocations can exercise internal preflight and accounting only.
// Block all public surfaces, including routes that bypass the shared executor.
v1Router.use("*", async (c, next) => {
    // Publication and background synchronization can be tested independently.
    // Open dispatch only after the remaining lifecycle and policy integration
    // is verified; this is a rollout gate, not a test-spending rule.
    if (requestStateEnabled(c.env) && c.env.GATEWAY_REQUEST_STATE_MODE === "published") {
        return c.json({ error: "request_state_cutover_not_ready" }, 503);
    }
    const token = c.req.header("authorization")?.replace(/^Bearer /, "") ?? "";
    if (requestStateEnabled(c.env) && isSyntheticKey(token.split("_")[3] ?? "")) {
        return c.json({ error: "synthetic_key_cannot_dispatch" }, 403);
    }
    await next();
});

// CORS for everything under /v1
const CORS_HEADERS: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
        "Authorization, Content-Type, traceparent, tracestate, x-title, http-referer, x-app-id, x-app-name, x-app-categories, x-phaseo-client, x-phaseo-client-version, x-phaseo-metadata, x-gateway-debug, x-phaseo-debug, X-Phaseo-Strictness, x-phaseo-cache-revalidate",
	"Access-Control-Expose-Headers": [...EXPOSED_UPSTREAM_RATE_LIMIT_HEADERS, "X-Request-Id"].join(", "),
    "Access-Control-Max-Age": "86400",
};

v1Router.use(
    "*",
    async (c, next) => {
        if (c.req.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: CORS_HEADERS,
            });
        }
        await next();
        if (c.res.status === 101) return;
        // Some upstream/proxied responses expose immutable headers.
        // Rebuild the response with a mutable Headers object before applying CORS.
        const headers = new Headers(c.res.headers);
        for (const [key, value] of Object.entries(CORS_HEADERS)) {
            headers.set(key, value);
        }
        c.res = new Response(c.res.body, {
            status: c.res.status,
            statusText: c.res.statusText,
            headers,
        });
    },
);

v1Router.route("/", inferenceRouter);
v1Router.all("*", lazyRouter(null, async () => {
    const [{ platformRouter }, { experimentsRoutes }] = await Promise.all([
        import("./control"), import("./experiments"),
    ]);
    return new Hono<Env>().route("/", platformRouter).route("/", experimentsRoutes);
}));
