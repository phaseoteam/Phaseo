// src/routes/v1/generation/ocr.ts
import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { makeEndpointHandler } from "@pipeline/index";
import { OcrSchema } from "@core/schemas";
import { withRuntime } from "../../utils";

const ocrHandler = makeEndpointHandler({ endpoint: "ocr", schema: OcrSchema });

export const ocrRoutes = new Hono<Env>();

ocrRoutes.post("/", withRuntime(ocrHandler));