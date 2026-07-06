import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "gmicloud",
    name: "GMI Cloud",
    apiKeyEnv: "GMI_API_KEY",
    baseUrl: "https://api.gmi-serving.com",
    baseUrlEnv: "GMI_BASE_URL",
    pathPrefix: "/v1",
});

