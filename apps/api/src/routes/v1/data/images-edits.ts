// src/routes/v1/generation/images-edits.ts
// Purpose: Data-plane route handler for images-edits requests.
// Why: Keeps endpoint wiring separate from pipeline logic.
// How: Wires HTTP routes to pipeline entrypoints and response helpers.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { makeEndpointHandler } from "@pipeline/index";
import { ImagesEditSchema } from "@core/schemas";
import { withRuntime } from "../../utils";

const imagesEditHandler = makeEndpointHandler({ endpoint: "images.edits", schema: ImagesEditSchema });

export const imagesEditsRoutes = new Hono<Env>();

imagesEditsRoutes.post("/", withRuntime(imagesEditHandler));








