import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "phala",
    name: "Phala",
    apiKeyEnv: "PHALA_API_KEY",
    baseUrl: "https://api.redpill.ai",
    baseUrlEnv: "PHALA_BASE_URL",
    pathPrefix: "/v1",
});

