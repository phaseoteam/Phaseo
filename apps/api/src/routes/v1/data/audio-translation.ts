// src/routes/v1/generation/audio-translation.ts
// Purpose: Data-plane route handler for audio-translation requests.
// Why: Keeps endpoint wiring separate from pipeline logic.
// How: Wires HTTP routes to pipeline entrypoints and response helpers.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { makeEndpointHandler } from "@pipeline/index";
import { AudioTranslationSchema } from "@core/schemas";
import { withRuntime } from "../../utils";

const audioTranslationHandler = makeEndpointHandler({ endpoint: "audio.translations", schema: AudioTranslationSchema });

export const audioTranslationRoutes = new Hono<Env>();

audioTranslationRoutes.post("/", withRuntime(audioTranslationHandler));








