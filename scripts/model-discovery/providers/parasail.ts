import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "parasail",
    name: "Parasail",
    apiKeyEnv: "PARASAIL_API_KEY",
    baseUrl: "https://api.parasail.ai",
    baseUrlEnv: "PARASAIL_BASE_URL",
    pathPrefix: "/v1",
});

