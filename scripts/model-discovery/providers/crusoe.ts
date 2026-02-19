import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "crusoe",
    name: "Crusoe",
    apiKeyEnv: "CRUSOE_API_KEY",
    baseUrl: "https://api.crusoe.ai",
    baseUrlEnv: "CRUSOE_BASE_URL",
    pathPrefix: "/v1",
});

