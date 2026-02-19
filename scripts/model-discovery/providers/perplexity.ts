import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "perplexity",
    name: "Perplexity",
    apiKeyEnv: "PERPLEXITY_API_KEY",
    baseUrl: "https://api.perplexity.ai",
    baseUrlEnv: "PERPLEXITY_BASE_URL",
    pathPrefix: "",
});

