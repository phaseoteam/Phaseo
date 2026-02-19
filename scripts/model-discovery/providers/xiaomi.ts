import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "xiaomi",
    name: "Xiaomi",
    apiKeyEnv: "XIAOMI_MIMO_API_KEY",
    baseUrl: "https://api.xiaomimimo.com",
    baseUrlEnv: "XIAOMI_MIMO_BASE_URL",
    pathPrefix: "/v1",
});

