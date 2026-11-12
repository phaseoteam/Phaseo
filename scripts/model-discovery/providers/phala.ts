import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "phala",
    name: "Phala",
    apiKeyEnv: "PHALA_API_KEY",
    // Phala routes are served through RedPill, Phala's gateway, which lists the full catalogue
    // (confidential and standard models). Every listed model is a Phala route, whoever hosts it.
    baseUrl: "https://api.redpill.ai",
    baseUrlEnv: "PHALA_BASE_URL",
    pathPrefix: "/v1",
    additionalModelPaths: ["/embeddings/models"],
});
