import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "nebius-token-factory-us-central-1",
    name: "Nebius Token Factory US Central 1",
    apiKeyEnv: "NEBIUS_TOKEN_FACTORY_API_KEY",
    baseUrl: "https://api.tokenfactory.nebius.com",
    baseUrlEnv: "NEBIUS_US_CENTRAL_1_BASE_URL",
    pathPrefix: "/v1",
});
