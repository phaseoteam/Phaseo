// src/routes/v1/generation/images-generations.ts
// Purpose: Data-plane route handler for images-generations requests.
// Why: Keeps endpoint wiring separate from pipeline logic.
// How: Wires HTTP routes to pipeline entrypoints and response helpers.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { makeEndpointHandler } from "@pipeline/index";
import { ImagesGenerationSchema } from "@core/schemas";
import { withRuntime } from "../../utils";

const imagesGenerationHandler = makeEndpointHandler({ endpoint: "images.generations", schema: ImagesGenerationSchema });

export const imagesGenerationsRoutes = new Hono<Env>();

imagesGenerationsRoutes.post("/", withRuntime(imagesGenerationHandler));








