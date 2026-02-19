import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "clarifai",
    name: "Clarifai",
    apiKeyEnv: "CLARIFAI_PAT",
    baseUrl: "https://api.clarifai.com",
    baseUrlEnv: "CLARIFAI_BASE_URL",
    pathPrefix: "/v2/ext/openai/v1",
});

