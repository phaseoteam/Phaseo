import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "atlascloud",
    name: "AtlasCloud",
    apiKeyEnv: "ATLAS_CLOUD_API_KEY",
    baseUrl: "https://api.atlascloud.ai",
    baseUrlEnv: "ATLAS_CLOUD_BASE_URL",
    pathPrefix: "/v1",
});

