import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "cohere",
    name: "Cohere",
    apiKeyEnv: "COHERE_API_KEY",
    baseUrl: "https://api.cohere.ai",
    baseUrlEnv: "COHERE_BASE_URL",
    pathPrefix: "/compatibility/v1",
});

