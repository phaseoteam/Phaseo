import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "nvidia",
    name: "Nvidia",
    apiKeyEnv: "NVIDIA_API_KEY",
    baseUrl: "https://integrate.api.nvidia.com",
    baseUrlEnv: "NVIDIA_BASE_URL",
    pathPrefix: "/v1",
});

