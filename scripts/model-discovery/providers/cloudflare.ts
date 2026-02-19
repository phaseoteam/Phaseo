import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "cloudflare",
    name: "Cloudflare",
    apiKeyEnv: "CLOUDFLARE_API_TOKEN",
    baseUrlEnv: "CLOUDFLARE_AI_GATEWAY_BASE_URL",
    pathPrefix: "",
});

