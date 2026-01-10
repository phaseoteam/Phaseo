// src/routes/v1/control/index.ts
import { Hono } from "hono";
import type { Env } from "@/runtime/types";

import { modelsRoutes } from "./models";
import { generationsRoutes } from "./generations";
import { placeholdersRoutes } from "./placeholders";
import { healthRoutes } from "./health";
import { analyticsRoutes } from "./analytics";
import { pricingRoutes } from "./pricing";

export const controlRouter = new Hono<Env>();

controlRouter.route("/models", modelsRoutes);
controlRouter.route("/generations", generationsRoutes);
controlRouter.route("/", placeholdersRoutes); // for credits, providers, etc.
controlRouter.route("/health", healthRoutes);
controlRouter.route("/analytics", analyticsRoutes);
controlRouter.route("/pricing", pricingRoutes);
