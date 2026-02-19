import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "cerebras",
    name: "Cerebras",
    apiKeyEnv: "CEREBRAS_API_KEY",
    baseUrl: "https://api.cerebras.ai",
    baseUrlEnv: "CEREBRAS_BASE_URL",
    pathPrefix: "/v1",
});

