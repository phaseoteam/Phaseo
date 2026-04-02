import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "ionrouter",
    name: "IonRouter",
    apiKeyEnv: "IONROUTER_API_KEY",
    baseUrl: "https://api.ionrouter.io",
    baseUrlEnv: "IONROUTER_BASE_URL",
    pathPrefix: "/v1",
});

