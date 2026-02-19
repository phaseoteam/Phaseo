import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "friendli",
    name: "Friendli",
    apiKeyEnv: "FRIENDLI_TOKEN",
    baseUrl: "https://api.friendli.ai",
    baseUrlEnv: "FRIENDLI_BASE_URL",
    pathPrefix: "/serverless/v1",
});

