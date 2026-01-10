// src/routes/v1/index.ts
import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { cors } from "hono/cors";

import { dataRouter } from "./data";
import { controlRouter } from "./control";

export const v1Router = new Hono<Env>();

// CORS for everything under /v1
v1Router.use(
    "*",
    cors({
        origin: "*",
        allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowHeaders: [
            "Authorization",
            "Content-Type",
            "x-title",
            "http-referer",
            "x-gateway-debug",
        ],
        maxAge: 86400,
    })
);

v1Router.route("/", dataRouter);
v1Router.route("/", controlRouter);
