import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "google",
    name: "Google",
    apiKeyEnv: "GOOGLE_AI_STUDIO_API_KEY",
    baseUrlEnv: "GOOGLE_BASE_URL",
    pathPrefix: "/v1",
});

