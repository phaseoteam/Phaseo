import type { ExecutionAdapter } from "./types";
import { coreToOpenAiChat, openAiChatResponseToCore } from "@/codecs/openai_chat";

export const AnthropicMessagesExecutor: ExecutionAdapter = {
    surface: "anthropic_messages",
    endpoint: "chat.completions",
    toUpstream: coreToOpenAiChat,
    fromUpstream: openAiChatResponseToCore,
};
