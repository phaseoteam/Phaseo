import type { ExecutionAdapter } from "./types";
import { coreToOpenAiChat, openAiChatResponseToCore } from "@/codecs/openai_chat";

export const GoogleGenerateContentExecutor: ExecutionAdapter = {
    surface: "google_generateContent",
    endpoint: "chat.completions",
    toUpstream: coreToOpenAiChat,
    fromUpstream: openAiChatResponseToCore,
};
