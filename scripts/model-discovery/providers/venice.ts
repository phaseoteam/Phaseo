import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "venice",
    name: "Venice",
    apiKeyEnv: "VENICE_API_KEY",
    baseUrl: "https://api.venice.ai",
    baseUrlEnv: "VENICE_BASE_URL",
    pathPrefix: "/v1",
});

