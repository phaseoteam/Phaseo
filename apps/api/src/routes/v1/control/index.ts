// src/routes/v1/control/index.ts
// Purpose: Control-plane route handler for index operations.
// Why: Separates admin/control traffic from data-plane requests.
// How: Wires HTTP routes to pipeline entrypoints and response helpers.
import { Hono } from "hono";
import type { Env } from "@/runtime/types";

import { modelsRoutes } from "./models";
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

export const controlRouter = new Hono<Env>();

controlRouter.route("/models", modelsRoutes);
controlRouter.route("/generations", generationsRoutes);
controlRouter.route("/organisations", organisationsRoutes);
controlRouter.route("/providers", providersRoutes);
controlRouter.route("/", placeholdersRoutes);
controlRouter.route("/health", healthRoutes);
controlRouter.route("/analytics", analyticsRoutes);
controlRouter.route("/pricing", pricingRoutes);
controlRouter.route("/credits", creditsRoutes);
controlRouter.route("/activity", activityRoutes);
controlRouter.route("/management", managementRoutes);
controlRouter.route("/provisioning", provisioningRoutes);
controlRouter.route("/keys", keysRoutes);
controlRouter.route("/oauth-clients", oauthClientsRoutes);









