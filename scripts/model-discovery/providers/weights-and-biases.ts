import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "weights-and-biases",
    name: "Weights And Biases",
    apiKeyEnv: ["WEIGHTSANDBIASES_API_KEY"],
    baseUrl: "https://api.inference.wandb.ai",
    baseUrlEnv: "WANDB_BASE_URL",
    pathPrefix: "/v1",
});

