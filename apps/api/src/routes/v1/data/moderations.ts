// src/routes/v1/generation/moderations.ts
// Purpose: Data-plane route handler for moderations requests.
// Why: Keeps endpoint wiring separate from pipeline logic.
// How: Wires HTTP routes to pipeline entrypoints and response helpers.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { makeEndpointHandler } from "@pipeline/index";
import { ModerationsSchema } from "@core/schemas";
import { withRuntime } from "../../utils";

const moderationHandler = makeEndpointHandler({ endpoint: "moderations", schema: ModerationsSchema });

export const moderationsRoutes = new Hono<Env>();

moderationsRoutes.post("/", withRuntime(moderationHandler));








