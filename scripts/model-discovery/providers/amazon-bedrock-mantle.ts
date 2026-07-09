import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "amazon-bedrock-mantle",
    name: "Amazon Bedrock (Mantle)",
    apiKeyEnv: "AMAZON_BEDROCK_MANTLE_API_KEY",
    baseUrl: "https://bedrock-mantle.us-east-1.api.aws",
    baseUrlEnv: "AMAZON_BEDROCK_MANTLE_BASE_URL",
    pathPrefix: "/v1",
});
