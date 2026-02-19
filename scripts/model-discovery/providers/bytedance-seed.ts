import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "bytedance-seed",
    name: "Bytedance Seed",
    apiKeyEnv: "BYTEDANCE_SEED_API_KEY",
    baseUrlEnv: "BYTEDANCE_SEED_BASE_URL",
    pathPrefix: "/v1",
});

