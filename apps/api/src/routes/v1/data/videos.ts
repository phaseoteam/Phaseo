// src/routes/v1/generation/videos.ts
import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { makeEndpointHandler } from "@pipeline/index";
import { VideoGenerationSchema } from "@core/schemas";
import { withRuntime } from "../../utils";

const videoHandler = makeEndpointHandler({ endpoint: "video.generation", schema: VideoGenerationSchema });

export const videosRoutes = new Hono<Env>();

videosRoutes.post("/", withRuntime(videoHandler));