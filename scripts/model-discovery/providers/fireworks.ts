import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "fireworks",
    name: "Fireworks",
    apiKeyEnv: "FIREWORKS_API_KEY",
    baseUrl: "https://api.fireworks.ai",
    baseUrlEnv: "FIREWORKS_BASE_URL",
    pathPrefix: "/inference/v1",
});

