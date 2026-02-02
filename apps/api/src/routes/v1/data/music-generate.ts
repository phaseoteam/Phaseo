// src/routes/v1/generation/music-generate.ts
// Purpose: Data-plane route handler for music-generate requests.
// Why: Keeps endpoint wiring separate from pipeline logic.
// How: Wires HTTP routes to pipeline entrypoints and response helpers.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { makeEndpointHandler } from "@pipeline/index";
import { MusicGenerateSchema } from "@core/schemas";
import { withRuntime } from "../../utils";

const musicGenerateHandler = makeEndpointHandler({ endpoint: "music.generate", schema: MusicGenerateSchema });

export const musicGenerateRoutes = new Hono<Env>();

musicGenerateRoutes.post("/", withRuntime(musicGenerateHandler));








