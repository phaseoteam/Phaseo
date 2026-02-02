// src/routes/v1/generation/audio-speech.ts
// Purpose: Data-plane route handler for audio-speech requests.
// Why: Keeps endpoint wiring separate from pipeline logic.
// How: Wires HTTP routes to pipeline entrypoints and response helpers.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { makeEndpointHandler } from "@pipeline/index";
import { AudioSpeechSchema } from "@core/schemas";
import { withRuntime } from "../../utils";

const audioSpeechHandler = makeEndpointHandler({ endpoint: "audio.speech", schema: AudioSpeechSchema });

export const audioSpeechRoutes = new Hono<Env>();

audioSpeechRoutes.post("/", withRuntime(audioSpeechHandler));








