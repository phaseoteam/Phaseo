import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "baseten",
    name: "Baseten",
    apiKeyEnv: "BASETEN_API_KEY",
    baseUrl: "https://api.baseten.co",
    baseUrlEnv: "BASETEN_BASE_URL",
    pathPrefix: "/v1",
});

