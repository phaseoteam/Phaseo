// src/routes/v1/control/index.ts
// Purpose: Platform API route handler for management and discovery operations.
// Why: Separates product/platform traffic from inference requests.
// How: Wires HTTP routes to pipeline entrypoints and response helpers.
import { Hono } from "hono";
import type { Env } from "@/runtime/types";

import { modelsRoutes } from "./models";
import { dataModelsRoutes } from "./models-data";
import { generationsRoutes } from "./generations";
import { placeholdersRoutes } from "./placeholders";
import { healthRoutes } from "./health";
import { analyticsRoutes } from "./analytics";
import { pricingRoutes } from "./pricing";
import { organisationsRoutes } from "./organisations";
import { providersRoutes } from "./providers";
import { creditsRoutes } from "./credits";
import { activityRoutes } from "./credits";
import { managementRoutes, provisioningRoutes } from "./provisioning";
import { keysRoutes } from "./keys";
import oauthClientsRoutes from "./oauth-clients";

export const platformRouter = new Hono<Env>();

platformRouter.route("/gateway/models", modelsRoutes);
platformRouter.route("/data/models", dataModelsRoutes);
platformRouter.route("/generations", generationsRoutes);
platformRouter.route("/organisations", organisationsRoutes);
platformRouter.route("/providers", providersRoutes);
platformRouter.route("/health", healthRoutes);
platformRouter.route("/analytics", analyticsRoutes);
platformRouter.route("/pricing", pricingRoutes);
platformRouter.route("/credits", creditsRoutes);
platformRouter.route("/activity", activityRoutes);
platformRouter.route("/management", managementRoutes);
platformRouter.route("/provisioning", provisioningRoutes);
platformRouter.route("/keys", keysRoutes);
platformRouter.route("/oauth-clients", oauthClientsRoutes);
platformRouter.route("/", placeholdersRoutes);

// Backward-compatible alias for existing imports.
export const controlRouter = platformRouter;









