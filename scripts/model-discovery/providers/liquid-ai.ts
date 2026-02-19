import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "liquid-ai",
    name: "Liquid Ai",
    apiKeyEnv: "LIQUID_AI_API_KEY",
    baseUrl: "https://api.liquid.ai",
    baseUrlEnv: "LIQUID_AI_BASE_URL",
    pathPrefix: "/v1",
});

