import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "mancer",
    name: "Mancer",
    apiKeyEnv: "MANCER_API_KEY",
    baseUrl: "https://mancer.tech",
    baseUrlEnv: "MANCER_BASE_URL",
    pathPrefix: "/oai/v1",
});

