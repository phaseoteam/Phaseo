// src/routes/v1/data/interactions.ts
// Purpose: Data-plane route handler for Google Interactions-compatible requests.
// Why: Exposes Google Interactions as a first-class gateway surface.
// How: Wires HTTP routes to the shared text generation pipeline.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { makeEndpointHandler } from "@pipeline/index";
import { InteractionsSchema } from "@core/schemas";
import { withRuntime } from "../../utils";

const interactionsHandler = makeEndpointHandler({ endpoint: "interactions", schema: InteractionsSchema });

export const interactionsRoutes = new Hono<Env>();

interactionsRoutes.post("/", withRuntime(interactionsHandler));
