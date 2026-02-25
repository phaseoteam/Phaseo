// src/routes/v1/index.ts
// Purpose: Aggregate v1 route groups (data + control).
// Why: Centralizes API version routing.
// How: Wires HTTP routes to pipeline entrypoints and response helpers.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";

import { dataRouter } from "./data";
import { controlRouter } from "./control";

export const v1Router = new Hono<Env>();

// CORS for everything under /v1
const CORS_HEADERS: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
        "Authorization, Content-Type, x-title, http-referer, x-gateway-debug, X-AIStats-Strictness",
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
        for (const [key, value] of Object.entries(CORS_HEADERS)) {
            c.res.headers.set(key, value);
        }
    },
);

v1Router.route("/", dataRouter);
v1Router.route("/", controlRouter);









