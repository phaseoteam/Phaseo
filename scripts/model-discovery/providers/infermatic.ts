import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "infermatic",
    name: "Infermatic",
    apiKeyEnv: "INFERMATIC_API_KEY",
    baseUrl: "https://api.totalgpt.ai",
    baseUrlEnv: "INFERMATIC_BASE_URL",
    pathPrefix: "/v1",
});

