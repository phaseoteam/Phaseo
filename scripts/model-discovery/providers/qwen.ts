import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "qwen",
    name: "Qwen",
    apiKeyEnv: "QWEN_API_KEY",
    baseUrl: "https://dashscope-intl.aliyuncs.com",
    baseUrlEnv: "QWEN_BASE_URL",
    pathPrefix: "/compatible-mode/v1",
});

