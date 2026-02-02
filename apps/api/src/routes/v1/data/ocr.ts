// src/routes/v1/generation/ocr.ts
// Purpose: Data-plane route handler for ocr requests.
// Why: Keeps endpoint wiring separate from pipeline logic.
// How: Wires HTTP routes to pipeline entrypoints and response helpers.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { makeEndpointHandler } from "@pipeline/index";
import { OcrSchema } from "@core/schemas";
import { withRuntime } from "../../utils";

const ocrHandler = makeEndpointHandler({ endpoint: "ocr", schema: OcrSchema });

export const ocrRoutes = new Hono<Env>();

ocrRoutes.post("/", withRuntime(ocrHandler));








