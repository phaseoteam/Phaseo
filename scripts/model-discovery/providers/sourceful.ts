import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "sourceful",
    name: "Sourceful",
    apiKeyEnv: "SOURCEFUL_API_KEY",
    baseUrl: "https://api.sourceful.ai",
    baseUrlEnv: "SOURCEFUL_BASE_URL",
    pathPrefix: "/v1",
});

