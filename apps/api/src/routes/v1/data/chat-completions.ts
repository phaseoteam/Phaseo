// src/routes/v1/generation/chat-completions.ts
import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { makeEndpointHandler } from "@pipeline/index";
import { ChatCompletionsSchema } from "@core/schemas";
import { withRuntime } from "../../utils";

const chatHandler = makeEndpointHandler({ endpoint: "chat.completions", schema: ChatCompletionsSchema });

export const chatCompletionsRoutes = new Hono<Env>();

chatCompletionsRoutes.post("/", withRuntime(chatHandler));
