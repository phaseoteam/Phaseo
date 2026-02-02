// src/routes/v1/generation/chat-completions.ts
// Purpose: Data-plane route handler for chat-completions requests.
// Why: Keeps endpoint wiring separate from pipeline logic.
// How: Wires HTTP routes to pipeline entrypoints and response helpers.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { makeEndpointHandler } from "@pipeline/index";
import { ChatCompletionsSchema } from "@core/schemas";
import { withRuntime } from "../../utils";

const chatHandler = makeEndpointHandler({ endpoint: "chat.completions", schema: ChatCompletionsSchema });

export const chatCompletionsRoutes = new Hono<Env>();

chatCompletionsRoutes.post("/", withRuntime(chatHandler));









