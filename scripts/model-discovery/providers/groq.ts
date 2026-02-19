import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "groq",
    name: "Groq",
    apiKeyEnv: "GROQ_API_KEY",
    baseUrl: "https://api.groq.com",
    baseUrlEnv: "GROQ_BASE_URL",
    pathPrefix: "/openai/v1",
});

