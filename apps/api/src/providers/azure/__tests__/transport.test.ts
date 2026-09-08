import { afterEach, describe, expect, it } from "vitest";
import { resolveOpenAITransport } from "../../shared/openai-transport";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";

afterEach(teardownTestRuntime);

describe("Azure OpenAI endpoint transport", () => {
    it("selects a regional resource and its own credential by model", () => {
        setupRuntimeFromEnv({
            AZURE_OPENAI_BASE_URL: "https://default.openai.azure.com",
            AZURE_OPENAI_API_KEY: "default-key",
            AZURE_OPENAI_DEPLOYMENTS: JSON.stringify({ "whisper-1": { baseUrl: "https://europe.openai.azure.com", deployment: "eu-whisper", authToken: "regional-token" } }),
        } as any);
        const result = resolveOpenAITransport({ providerId: "azure", model: "openai/whisper-1", providerModelSlug: "whisper-1", byokMeta: [] } as any, "/audio/transcriptions");
        expect(result.url).toBe("https://europe.openai.azure.com/openai/v1/audio/transcriptions");
        expect(result.deployment).toBe("eu-whisper");
        expect(result.headers.Authorization).toBe("Bearer regional-token");
        expect(result.headers["api-key"]).toBeUndefined();
    });

    it("does not send the default resource key to a different regional resource", () => {
        setupRuntimeFromEnv({ AZURE_OPENAI_API_KEY: "default-key", AZURE_OPENAI_DEPLOYMENTS: JSON.stringify({ "whisper-1": { baseUrl: "https://europe.openai.azure.com" } }) } as any);
        expect(() => resolveOpenAITransport({ providerId: "azure", model: "whisper-1", byokMeta: [] } as any, "/audio/transcriptions")).toThrow("azure_key_missing");
    });

    it.each(["/embeddings", "/images/generations", "/images/edits", "/audio/speech", "/audio/transcriptions", "/audio/translations"])("uses v1 and Entra auth for %s", (path) => {
        setupRuntimeFromEnv({ AZURE_OPENAI_BASE_URL: "https://eastus-resource.openai.azure.com/openai/v1/", AZURE_OPENAI_AUTH_TOKEN: "entra" } as any);
        const result = resolveOpenAITransport({ providerId: "azure", model: "openai/whisper-1", providerModelSlug: "custom-deployment", byokMeta: [] } as any, path);
        expect(result.url).toBe(`https://eastus-resource.openai.azure.com/openai/v1${path}`);
        expect(result.headers.Authorization).toBe("Bearer entra");
        expect(result.headers["api-key"]).toBeUndefined();
    });

    it("uses the encoded deployment and API version on legacy resources", () => {
        setupRuntimeFromEnv({ AZURE_OPENAI_BASE_URL: "https://westeurope-resource.openai.azure.com", AZURE_OPENAI_API_KEY: "key", AZURE_OPENAI_API_VERSION: "2024-10-21" } as any);
        const result = resolveOpenAITransport({ providerId: "azure", model: "openai/whisper-1", providerModelSlug: "my deployment", byokMeta: [] } as any, "/audio/transcriptions");
        expect(result.url).toBe("https://westeurope-resource.openai.azure.com/openai/deployments/my%20deployment/audio/transcriptions?api-version=2024-10-21");
        expect(result.headers["api-key"]).toBe("key");
    });
});
