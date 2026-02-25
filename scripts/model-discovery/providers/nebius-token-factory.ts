import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "nebius-token-factory",
    name: "Nebius Token Factory",
    apiKeyEnv: "NEBIUS_TOKEN_FACTORY_API_KEY",
    baseUrl: "https://api.tokenfactory.nebius.com",
    baseUrlEnv: "NEBIUS_BASE_URL",
    pathPrefix: "/v1",
});

