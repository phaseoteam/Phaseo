import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "featherless",
    name: "Featherless",
    apiKeyEnv: "FEATHERLESS_API_KEY",
    baseUrl: "https://api.featherless.ai",
    baseUrlEnv: "FEATHERLESS_BASE_URL",
    pathPrefix: "/v1",
    apiKeyHeader: "Authentication",
});

