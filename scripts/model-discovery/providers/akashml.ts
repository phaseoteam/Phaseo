import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "akashml",
    name: "AkashML",
    apiKeyEnv: "AKASHML_API_KEY",
    baseUrl: "https://api.akashml.com",
    baseUrlEnv: "AKASHML_BASE_URL",
    pathPrefix: "/v1",
});

