import { beforeAll, describe, expect, it } from "vitest";
import {
    LIVE_RUN,
    TINY_PNG_DATA_URL,
    assertOk,
    hasPricing,
    postJson,
    requireGatewayApiKey,
    resolveModelFromCatalog,
    resolveProvidersForModel,
    usageFromPayload,
    usageTotal,
} from "./live-gateway.helpers";

const LIVE_EMBEDDINGS_MODERATION_RUN = (process.env.LIVE_EMBEDDINGS_MODERATION_RUN ?? "0").trim() === "1";
const describeLive = LIVE_RUN && LIVE_EMBEDDINGS_MODERATION_RUN ? describe : describe.skip;

let moderationModel = "openai/omni-moderation";
let embeddingModel = "google/gemini-embedding-2";
let embeddingProvider = "google-ai-studio";

function assertUsageAndPricing(json: any, label: string) {
    const usage = usageFromPayload(json);
    expect(usage, `${label} missing usage`).toBeTruthy();
    expect(usageTotal(usage), `${label} usage should be non-zero`).toBeGreaterThan(0);
    expect(hasPricing(json), `${label} missing pricing/cost`).toBe(true);
}

function assertUsageIfPresent(json: any, label: string) {
    const usage = usageFromPayload(json);
    if (usage == null) return;
    expect(typeof usage, `${label} usage should be an object when present`).toBe("object");
}

describeLive("Embeddings and moderation live coverage", () => {
    beforeAll(async () => {
        requireGatewayApiKey();
        moderationModel = await resolveModelFromCatalog({
            preferredModelIds: ["openai/omni-moderation", "openai/omni-moderation-latest"],
            providerId: "openai",
        });
        embeddingModel = await resolveModelFromCatalog({
            preferredModelIds: ["google/gemini-embedding-2", "google/gemini-embedding-2-preview"],
        });
        const providers = await resolveProvidersForModel({ modelId: embeddingModel });
        embeddingProvider =
            providers.find((providerId) => providerId === "google-ai-studio") ??
            providers.find((providerId) => providerId === "google-vertex") ??
            providers[0] ??
            "google-ai-studio";

        console.log(
            `[embeddings-moderation] moderationModel=${moderationModel} embeddingModel=${embeddingModel} embeddingProvider=${embeddingProvider}`,
        );
    }, 120_000);

    it(
        "openai_omni_moderation",
        async () => {
            const result = await postJson("/moderations", {
                model: moderationModel,
                input: "Hello world",
                usage: true,
                meta: true,
                provider: { only: ["openai"] },
            });
            assertOk(result, "/moderations");
            if (!("json" in result)) throw new Error("Expected JSON response");
            expect(Array.isArray(result.json?.results), "moderations should return results").toBe(true);
            expect(result.json?.results?.length ?? 0).toBeGreaterThan(0);
            // OpenAI moderation can be free and may omit billable usage.
            assertUsageIfPresent(result.json, "openai_omni_moderation");
        },
        120_000,
    );

    it(
        "gemini_embedding_2_text",
        async () => {
            const result = await postJson("/embeddings", {
                model: embeddingModel,
                input: "hello embeddings",
                usage: true,
                meta: true,
                provider: { only: [embeddingProvider] },
            });
            assertOk(result, "/embeddings text");
            if (!("json" in result)) throw new Error("Expected JSON response");
            expect(Array.isArray(result.json?.data), "embeddings should return data").toBe(true);
            expect(result.json?.data?.length ?? 0).toBeGreaterThan(0);
            expect(Array.isArray(result.json?.data?.[0]?.embedding)).toBe(true);
            expect(result.json?.data?.[0]?.embedding?.length ?? 0).toBeGreaterThan(0);
            assertUsageAndPricing(result.json, "gemini_embedding_2_text");
        },
        120_000,
    );

    it(
        "gemini_embedding_2_multimodal",
        async () => {
            const result = await postJson("/embeddings", {
                model: embeddingModel,
                input: {
                    content: [
                        { type: "input_text", text: "index this image" },
                        {
                            type: "input_image",
                            image_url: {
                                url: TINY_PNG_DATA_URL,
                            },
                        },
                    ],
                },
                provider_options: {
                    google: {
                        task_type: "RETRIEVAL_QUERY",
                    },
                },
                usage: true,
                meta: true,
                provider: { only: [embeddingProvider] },
            });
            assertOk(result, "/embeddings multimodal");
            if (!("json" in result)) throw new Error("Expected JSON response");
            expect(Array.isArray(result.json?.data), "multimodal embeddings should return data").toBe(true);
            expect(result.json?.data?.length ?? 0).toBeGreaterThan(0);
            expect(Array.isArray(result.json?.data?.[0]?.embedding)).toBe(true);
            expect(result.json?.data?.[0]?.embedding?.length ?? 0).toBeGreaterThan(0);
            assertUsageAndPricing(result.json, "gemini_embedding_2_multimodal");
        },
        120_000,
    );
});
