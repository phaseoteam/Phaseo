import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "relace",
    name: "Relace",
    apiKeyEnv: "RELACE_API_KEY",
    baseUrl: "https://api.relace.ai",
    baseUrlEnv: "RELACE_BASE_URL",
    pathPrefix: "/v1",
});

