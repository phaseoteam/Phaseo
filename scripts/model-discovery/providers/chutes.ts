import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "chutes",
    name: "Chutes",
    apiKeyEnv: "CHUTES_API_KEY",
    baseUrl: "https://llm.chutes.ai",
    baseUrlEnv: "CHUTES_BASE_URL",
    pathPrefix: "/v1",
});

