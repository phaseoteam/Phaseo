// src/routes/root.ts
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
