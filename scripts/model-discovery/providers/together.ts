import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "together",
    name: "Together",
    apiKeyEnv: "TOGETHER_API_KEY",
    baseUrl: "https://api.together.xyz",
    baseUrlEnv: "TOGETHER_BASE_URL",
    pathPrefix: "/v1",
});

