import { afterEach, describe, expect, it } from "vitest";
import { resolveOpenAITransport } from "../../shared/openai-transport";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";

afterEach(teardownTestRuntime);

describe("Cloudflare OpenAI endpoint transport", () => {
    it("uses the customer's account and token for a JSON BYOK credential", () => {
        setupRuntimeFromEnv({ CLOUDFLARE_ACCOUNT_ID: "phaseo-account", CLOUDFLARE_API_TOKEN: "phaseo-token" } as any);
        const byokMeta = [{ id: "byok-cf", key: JSON.stringify({ apiToken: "customer-token", accountId: "0123456789abcdef0123456789abcdef" }) }];
        const result = resolveOpenAITransport({ providerId: "cloudflare", model: "baai/bge-m3", byokMeta } as any, "/embeddings");
        expect(result.url).toBe("https://api.cloudflare.com/client/v4/accounts/0123456789abcdef0123456789abcdef/ai/v1/embeddings");
        expect(result.headers.Authorization).toBe("Bearer customer-token");
        expect(result.headers["cf-aig-gateway-id"]).toBeUndefined();
        expect(result.keyInfo).toMatchObject({ source: "byok", byokId: "byok-cf" });
    });

    it("keeps the gateway account and AI Gateway id for the managed key", () => {
        setupRuntimeFromEnv({ CLOUDFLARE_ACCOUNT_ID: "phaseo-account", CLOUDFLARE_API_TOKEN: "phaseo-token" } as any);
        const result = resolveOpenAITransport({ providerId: "cloudflare", model: "baai/bge-m3", byokMeta: [] } as any, "/embeddings");
        expect(result.url).toBe("https://api.cloudflare.com/client/v4/accounts/phaseo-account/ai/v1/embeddings");
        expect(result.headers.Authorization).toBe("Bearer phaseo-token");
        expect(result.headers["cf-aig-gateway-id"]).toBe("default");
    });
});
