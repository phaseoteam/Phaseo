// src/routes/v1/generation/audio-transcription.ts
// Purpose: Data-plane route handler for audio-transcription requests.
// Why: Keeps endpoint wiring separate from pipeline logic.
// How: Wires HTTP routes to pipeline entrypoints and response helpers.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { makeEndpointHandler } from "@pipeline/index";
import { AudioTranscriptionSchema } from "@core/schemas";
import { withRuntime } from "../../utils";

const audioTranscriptionHandler = makeEndpointHandler({ endpoint: "audio.transcription", schema: AudioTranscriptionSchema });

export const audioTranscriptionRoutes = new Hono<Env>();

audioTranscriptionRoutes.post("/", withRuntime(audioTranscriptionHandler));








