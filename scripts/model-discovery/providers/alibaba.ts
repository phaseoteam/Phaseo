import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "alibaba",
    name: "Alibaba",
    apiKeyEnv: "ALIBABA_API_KEY",
    baseUrl: "https://dashscope-intl.aliyuncs.com",
    baseUrlEnv: "ALIBABA_BASE_URL",
    pathPrefix: "/compatible-mode/v1",
});

