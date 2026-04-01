import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "arcee-ai",
    name: "Arcee Ai",
    apiKeyEnv: ["ARCEE_AI_API_KEY", "ARCEE_API_KEY"],
    baseUrl: "https://api.arcee.ai",
    baseUrlEnv: "ARCEE_BASE_URL",
    pathPrefix: "/api/v1",
});

