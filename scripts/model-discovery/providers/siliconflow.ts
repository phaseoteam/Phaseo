import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "siliconflow",
    name: "Siliconflow",
    apiKeyEnv: "SILICONFLOW_API_KEY",
    baseUrl: "https://api.siliconflow.com",
    baseUrlEnv: "SILICONFLOW_BASE_URL",
    pathPrefix: "/v1",
});

