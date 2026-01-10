// src/routes/v1/generation/moderations.ts
import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { makeEndpointHandler } from "@pipeline/index";
import { ModerationsSchema } from "@core/schemas";
import { withRuntime } from "../../utils";

const moderationHandler = makeEndpointHandler({ endpoint: "moderations", schema: ModerationsSchema });

export const moderationsRoutes = new Hono<Env>();

moderationsRoutes.post("/", withRuntime(moderationHandler));