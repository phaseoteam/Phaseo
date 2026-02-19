import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "ai21",
    name: "AI21",
    apiKeyEnv: "AI21_API_KEY",
    baseUrl: "https://api.ai21.com",
    baseUrlEnv: "AI21_BASE_URL",
    pathPrefix: "/studio/v1",
});

