import type { ExecutionSurface } from "@/core/surfaces";
import type { ExecutionAdapter } from "./types";
import { OpenAIChatExecutor } from "./openai_chat";
import { OpenAIResponsesExecutor } from "./openai_responses";
import { AnthropicMessagesExecutor } from "./anthropic_messages";
import { GoogleGenerateContentExecutor } from "./google_generate_content";

const EXECUTORS: Record<ExecutionSurface, ExecutionAdapter> = {
    openai_chat: OpenAIChatExecutor,
    openai_responses: OpenAIResponsesExecutor,
    anthropic_messages: AnthropicMessagesExecutor,
    google_generateContent: GoogleGenerateContentExecutor,
};

export function executorForSurface(surface: ExecutionSurface): ExecutionAdapter {
    return EXECUTORS[surface] ?? OpenAIChatExecutor;
}
