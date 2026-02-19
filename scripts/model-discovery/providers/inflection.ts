import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "inflection",
    name: "Inflection",
    apiKeyEnv: "INFLECTION_API_KEY",
    baseUrlEnv: "INFLECTION_BASE_URL",
    pathPrefix: "/v1",
});

