// src/routes/v1/generation/music-generate.ts
import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { makeEndpointHandler } from "@pipeline/index";
import { MusicGenerateSchema } from "@core/schemas";
import { withRuntime } from "../../utils";

const musicGenerateHandler = makeEndpointHandler({ endpoint: "music.generate", schema: MusicGenerateSchema });

export const musicGenerateRoutes = new Hono<Env>();

musicGenerateRoutes.post("/", withRuntime(musicGenerateHandler));