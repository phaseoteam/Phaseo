// src/routes/v1/index.ts
// Purpose: Aggregate v1 route groups (inference + platform).
// Why: Centralizes API version routing.
// How: Wires HTTP routes to pipeline entrypoints and response helpers.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";

import { inferenceRouter } from "./data";
import { platformRouter } from "./control";
import { experimentsRoutes } from "./experiments";

export const v1Router = new Hono<Env>();

// CORS for everything under /v1
const CORS_HEADERS: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
        "Authorization, Content-Type, x-title, http-referer, x-app-id, x-app-name, x-gateway-debug, x-phaseo-debug, X-Phaseo-Strictness, x-phaseo-cache-revalidate",
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
v1Router.route("/", platformRouter);
v1Router.route("/", experimentsRoutes);









