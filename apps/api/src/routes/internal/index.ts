// src/routes/internal/index.ts
// Purpose: Aggregate internal-only route groups.
// Why: Keep internal endpoints separated from public API surface.
// How: Mounts internal route modules under /internal/* namespaces.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { internalBatchWebhookRoutes } from "./batch-webhooks";
import { internalVideoWebhookRoutes } from "./video-webhooks";
import { internalCacheRoutes } from "./cache";
import { internalIoLogRoutes } from "./io-logs";
import { internalNotificationTestRoutes } from "./notification-tests";
import { internalObservabilityIncidentRoutes } from "./observability-incidents";
import { internalFreeModelSettingsRoutes } from "./free-model-settings";
import { internalFreeModelRecoveryRoutes } from "./free-model-recovery";

export const internalRouter = new Hono<Env>();

internalRouter.route("/batch-webhooks", internalBatchWebhookRoutes);
internalRouter.route("/cache", internalCacheRoutes);
internalRouter.route("/io-logs", internalIoLogRoutes);
internalRouter.route("/video-webhooks", internalVideoWebhookRoutes);
internalRouter.route("/notification-tests", internalNotificationTestRoutes);
internalRouter.route("/observability-incidents", internalObservabilityIncidentRoutes);
internalRouter.route("/free-model-quota", internalFreeModelSettingsRoutes);
internalRouter.route("/free-model-recovery", internalFreeModelRecoveryRoutes);
