import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "xai",
    name: "xAI",
    apiKeyEnv: "XAI_API_KEY",
    baseUrl: "https://api.x.ai",
    baseUrlEnv: "XAI_BASE_URL",
    pathPrefix: "/v1",
});

