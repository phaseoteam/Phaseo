// src/routes/internal/index.ts
// Purpose: Aggregate internal-only route groups.
// Why: Keep internal endpoints separated from public API surface.
// How: Mounts internal route modules under /internal/* namespaces.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { internalVideoWebhookRoutes } from "./video-webhooks";
import { internalCacheRoutes } from "./cache";

export const internalRouter = new Hono<Env>();

internalRouter.route("/cache", internalCacheRoutes);
internalRouter.route("/video-webhooks", internalVideoWebhookRoutes);
