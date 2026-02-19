import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "stepfun",
    name: "Stepfun",
    apiKeyEnv: "STEPFUN_API_KEY",
    baseUrl: "https://api.stepfun.com",
    baseUrlEnv: "STEPFUN_BASE_URL",
    pathPrefix: "/v1",
});

