import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "inception",
    name: "Inception",
    apiKeyEnv: "INCEPTION_API_KEY",
    baseUrl: "https://api.inceptionlabs.ai",
    baseUrlEnv: "INCEPTION_BASE_URL",
    pathPrefix: "/v1",
});

