import { defineOpenAICompatibleProvider } from "./_openai-compatible-provider";

export default defineOpenAICompatibleProvider({
    providerId: "google-vertex",
    name: "Google Vertex",
    apiKeyEnv: "GOOGLE_VERTEX_API_KEY",
    baseUrlEnv: "GOOGLE_VERTEX_BASE_URL",
    pathPrefix: "",
});

