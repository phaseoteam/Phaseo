import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "arcee",
    name: "Arcee",
    apiKeyEnv: "ARCEE_API_KEY",
    baseUrl: "https://api.arcee.ai",
    baseUrlEnv: "ARCEE_BASE_URL",
    pathPrefix: "/api/v1",
});

