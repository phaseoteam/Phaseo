import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "liquid",
    name: "Liquid",
    apiKeyEnv: "LIQUID_API_KEY",
    baseUrl: "https://api.liquid.ai",
    baseUrlEnv: "LIQUID_BASE_URL",
    pathPrefix: "/v1",
});

