// src/routes/v1/generation/audio-speech.ts
import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { makeEndpointHandler } from "@pipeline/index";
import { AudioSpeechSchema } from "@core/schemas";
import { withRuntime } from "../../utils";

const audioSpeechHandler = makeEndpointHandler({ endpoint: "audio.speech", schema: AudioSpeechSchema });

export const audioSpeechRoutes = new Hono<Env>();

audioSpeechRoutes.post("/", withRuntime(audioSpeechHandler));