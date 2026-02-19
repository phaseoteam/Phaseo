import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "amazon-bedrock",
    name: "Amazon Bedrock",
    apiKeyEnv: "AMAZON_BEDROCK_API_KEY",
    baseUrlEnv: "AMAZON_BEDROCK_BASE_URL",
    pathPrefix: "/v1",
});

