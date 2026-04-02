import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "byteplus",
    name: "BytePlus",
    apiKeyEnv: "BYTEPLUS_API_KEY",
    baseUrl: "https://ark.ap-southeast.bytepluses.com",
    baseUrlEnv: "BYTEPLUS_BASE_URL",
    pathPrefix: "/api/v3",
});
