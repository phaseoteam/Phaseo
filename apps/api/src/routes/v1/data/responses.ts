// src/routes/v1/generation/responses.ts
// Purpose: Data-plane route handler for responses requests.
// Why: Keeps endpoint wiring separate from pipeline logic.
// How: Wires HTTP routes to pipeline entrypoints and response helpers.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { makeEndpointHandler } from "@pipeline/index";
import { ResponsesSchema } from "@core/schemas";
import { withRuntime } from "../../utils";

const responsesHandler = makeEndpointHandler({ endpoint: "responses", schema: ResponsesSchema });

export const responsesRoutes = new Hono<Env>();

responsesRoutes.post("/", withRuntime(responsesHandler));
