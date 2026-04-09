// src/routes/v1/generation/rerank.ts
// Purpose: Data-plane route handler for rerank requests.
// Why: Keeps endpoint wiring separate from pipeline logic.
// How: Wires HTTP routes to pipeline entrypoints and response helpers.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { makeEndpointHandler } from "@pipeline/index";
import { RerankSchema } from "@core/schemas";
import { withRuntime } from "../../utils";

const rerankHandler = makeEndpointHandler({ endpoint: "rerank", schema: RerankSchema });

export const rerankRoutes = new Hono<Env>();

rerankRoutes.post("/", withRuntime(rerankHandler));
