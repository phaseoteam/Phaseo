import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "morpheus",
    name: "Morpheus",
    apiKeyEnv: "MORPHEUS_API_KEY",
    baseUrl: "https://api.mor.org",
    baseUrlEnv: "MORPHEUS_BASE_URL",
    pathPrefix: "/api/v1",
});

