import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "deepinfra",
    name: "Deepinfra",
    apiKeyEnv: "DEEPINFRA_API_KEY",
    baseUrl: "https://api.deepinfra.com",
    baseUrlEnv: "DEEPINFRA_BASE_URL",
    pathPrefix: "/v1/openai",
});

