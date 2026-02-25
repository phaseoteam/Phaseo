import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "nextbit",
    name: "NextBit",
    apiKeyEnv: "NEXTBIT_API_KEY",
    baseUrl: "https://api.nextbit256.com",
    baseUrlEnv: "NEXTBIT_BASE_URL",
    pathPrefix: "/v1",
});
