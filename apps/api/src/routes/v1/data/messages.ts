// src/routes/v1/data/messages.ts
// Purpose: Data-plane route handler for messages requests.
// Why: Keeps endpoint wiring separate from pipeline logic.
// How: Wires HTTP routes to pipeline entrypoints and response helpers.

// Anthropic Messages API endpoint
import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { makeEndpointHandler } from "@pipeline/index";
import { AnthropicMessagesSchema } from "@core/schemas";
import { withRuntime } from "../../utils";

const messagesHandler = makeEndpointHandler({ endpoint: "messages", schema: AnthropicMessagesSchema });

export const messagesRoutes = new Hono<Env>();

messagesRoutes.post("/", withRuntime(messagesHandler));
