import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "hyperbolic",
    name: "Hyperbolic",
    apiKeyEnv: "HYPERBOLIC_API_KEY",
    baseUrl: "https://api.hyperbolic.xyz",
    baseUrlEnv: "HYPERBOLIC_BASE_URL",
    pathPrefix: "/v1",
});

