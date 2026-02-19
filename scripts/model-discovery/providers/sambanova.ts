import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "sambanova",
    name: "Sambanova",
    apiKeyEnv: "SAMBANOVA_API_KEY",
    baseUrlEnv: "SAMBANOVA_BASE_URL",
    pathPrefix: "",
});

