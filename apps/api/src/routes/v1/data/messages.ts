// src/routes/v1/data/messages.ts
// Anthropic Messages API endpoint
import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { makeEndpointHandler } from "@pipeline/index";
import { AnthropicMessagesSchema } from "@core/schemas";
import { withRuntime } from "../../utils";

const messagesHandler = makeEndpointHandler({ endpoint: "chat.completions", schema: AnthropicMessagesSchema });

export const messagesRoutes = new Hono<Env>();

messagesRoutes.post("/", withRuntime(messagesHandler));
