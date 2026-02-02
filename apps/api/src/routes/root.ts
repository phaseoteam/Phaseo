// src/routes/root.ts
// Purpose: Root routes (health, basic info, and top-level wiring).
// Why: Keeps non-versioned routes explicit and minimal.
// How: Wires HTTP routes to pipeline entrypoints and response helpers.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { json, withRuntime } from "./utils";

export const rootRouter = new Hono<Env>();

rootRouter.get(
    "/",
    withRuntime(async () =>
        json({
            message:
                "Welcome to the AI Stats Gateway API! Documentation is available at https://docs.ai-stats.phaseo.app",
            timestamp: new Date().toISOString(),
        })
    )
);









