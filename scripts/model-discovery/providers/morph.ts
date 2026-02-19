import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "morph",
    name: "Morph",
    apiKeyEnv: "MORPH_API_KEY",
    baseUrl: "https://api.morphllm.com",
    baseUrlEnv: "MORPH_BASE_URL",
    pathPrefix: "/v1",
});

