import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "zai",
    name: "Z.AI",
    apiKeyEnv: "ZAI_API_KEY",
    baseUrl: "https://api.z.ai",
    baseUrlEnv: "ZAI_BASE_URL",
    pathPrefix: "/api/paas/v4",
});

