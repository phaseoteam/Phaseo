import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "nebius-token-factory-eu-north-1",
    name: "Nebius Token Factory EU North 1",
    apiKeyEnv: "NEBIUS_API_KEY",
    baseUrl: "https://api.tokenfactory.nebius.com",
    baseUrlEnv: "NEBIUS_EU_NORTH_1_BASE_URL",
    pathPrefix: "/v1",
});
