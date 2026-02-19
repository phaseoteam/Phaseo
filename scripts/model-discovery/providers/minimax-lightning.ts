import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "minimax-lightning",
    name: "Minimax Lightning",
    apiKeyEnv: "MINIMAX_API_KEY",
    baseUrl: "https://api.minimax.io",
    baseUrlEnv: "MINIMAX_BASE_URL",
    pathPrefix: "/v1",
});

