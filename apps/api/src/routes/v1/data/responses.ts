// src/routes/v1/generation/responses.ts
import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { makeEndpointHandler } from "@pipeline/index";
import { ResponsesSchema } from "@core/schemas";
import { withRuntime } from "../../utils";

const responsesHandler = makeEndpointHandler({ endpoint: "responses", schema: ResponsesSchema });

export const responsesRoutes = new Hono<Env>();

responsesRoutes.post("/", withRuntime(responsesHandler));