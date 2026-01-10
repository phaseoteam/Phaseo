// src/routes/v1/generation/audio-transcription.ts
import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { makeEndpointHandler } from "@pipeline/index";
import { AudioTranscriptionSchema } from "@core/schemas";
import { withRuntime } from "../../utils";

const audioTranscriptionHandler = makeEndpointHandler({ endpoint: "audio.transcription", schema: AudioTranscriptionSchema });

export const audioTranscriptionRoutes = new Hono<Env>();

audioTranscriptionRoutes.post("/", withRuntime(audioTranscriptionHandler));