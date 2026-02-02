// src/routes/v1/generation/embeddings.ts
// Purpose: Data-plane route handler for embeddings requests.
// Why: Keeps endpoint wiring separate from pipeline logic.
// How: Wires HTTP routes to pipeline entrypoints and response helpers.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { makeEndpointHandler } from "@pipeline/index";
import { EmbeddingsSchema } from "@core/schemas";
import { withRuntime } from "../../utils";

const embeddingsHandler = makeEndpointHandler({ endpoint: "embeddings", schema: EmbeddingsSchema });

export const embeddingsRoutes = new Hono<Env>();

embeddingsRoutes.post("/", withRuntime(embeddingsHandler));








