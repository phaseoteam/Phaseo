// src/routes/v1/generation/images-generations.ts
import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { makeEndpointHandler } from "@pipeline/index";
import { ImagesGenerationSchema } from "@core/schemas";
import { withRuntime } from "../../utils";

const imagesGenerationHandler = makeEndpointHandler({ endpoint: "images.generations", schema: ImagesGenerationSchema });

export const imagesGenerationsRoutes = new Hono<Env>();

imagesGenerationsRoutes.post("/", withRuntime(imagesGenerationHandler));