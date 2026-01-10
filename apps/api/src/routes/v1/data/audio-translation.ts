// src/routes/v1/generation/audio-translation.ts
import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { makeEndpointHandler } from "@pipeline/index";
import { AudioTranslationSchema } from "@core/schemas";
import { withRuntime } from "../../utils";

const audioTranslationHandler = makeEndpointHandler({ endpoint: "audio.translations", schema: AudioTranslationSchema });

export const audioTranslationRoutes = new Hono<Env>();

audioTranslationRoutes.post("/", withRuntime(audioTranslationHandler));