import type { ExecutionAdapter } from "./types";
import { coreToOpenAiChat, openAiChatResponseToCore } from "@/codecs/openai_chat";

export const OpenAIChatExecutor: ExecutionAdapter = {
    surface: "openai_chat",
    endpoint: "chat.completions",
    toUpstream: coreToOpenAiChat,
    fromUpstream: openAiChatResponseToCore,
};
