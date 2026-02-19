import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "moonshot-ai-turbo",
    name: "Moonshot Ai Turbo",
    apiKeyEnv: "MOONSHOT_AI_API_KEY",
    baseUrl: "https://api.moonshot.ai",
    baseUrlEnv: "MOONSHOT_AI_BASE_URL",
    pathPrefix: "/v1",
});

