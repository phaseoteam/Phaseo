import type { ExecutionAdapter } from "./types";
import { coreToOpenAiResponses, openAiResponsesResponseToCore } from "@/codecs/openai_responses";

export const OpenAIResponsesExecutor: ExecutionAdapter = {
    surface: "openai_responses",
    endpoint: "responses",
    toUpstream: coreToOpenAiResponses,
    fromUpstream: openAiResponsesResponseToCore,
};
