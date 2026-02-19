import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "aion-labs",
    name: "Aion Labs",
    apiKeyEnv: "AION_LABS_API_KEY",
    baseUrl: "https://api.aionlabs.ai",
    baseUrlEnv: "AION_LABS_BASE_URL",
    pathPrefix: "/v1",
});

