import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => {
    const cache = {
        get: vi.fn(async () => null),
        put: vi.fn(async () => undefined),
        delete: vi.fn(async () => undefined),
    };

    const rpc = vi.fn(async () => ({
        data: [
            {
                workspace_id: "team_free",
                resolved_model: "ai-stats/free",
                key_ok: { ok: true, reason: null },
                key_limit_ok: { ok: true, reason: null },
                credit_ok: { ok: true, reason: null },
                providers: [],
                pricing: {},
            },
        ],
        error: null,
    }));

    const freeProviderModels = [
        {
            provider_api_model_id: "pm_openai_a",
            provider_id: "openai",
            provider_model_slug: "gpt-free-a",
            api_model_id: "openai/gpt-free-a",
            model_id: "openai/gpt-free-a",
            routing_status: "active",
            input_modalities: ["text"],
            output_modalities: ["text"],
            effective_from: "2026-05-01T00:00:00Z",
            effective_to: null,
        },
        {
            provider_api_model_id: "pm_openai_b",
            provider_id: "openai",
            provider_model_slug: "gpt-free-b",
            api_model_id: "openai/gpt-free-b",
            model_id: "openai/gpt-free-b",
            routing_status: "active",
            input_modalities: ["text"],
            output_modalities: ["text"],
            effective_from: "2026-05-02T00:00:00Z",
            effective_to: null,
        },
        {
            provider_api_model_id: "pm_google_a",
            provider_id: "google-ai-studio",
            provider_model_slug: "gemini-free",
            api_model_id: "google/gemini-free",
            model_id: "google/gemini-free",
            routing_status: "active",
            input_modalities: ["text"],
            output_modalities: ["text"],
            effective_from: "2026-05-01T00:00:00Z",
            effective_to: null,
        },
    ];

    const dataModels = [
        {
            model_id: "openai/gpt-free-a",
            hidden: false,
            status: "active",
            deprecation_date: null,
            retirement_date: null,
        },
        {
            model_id: "openai/gpt-free-b",
            hidden: false,
            status: "active",
            deprecation_date: null,
            retirement_date: null,
        },
        {
            model_id: "google/gemini-free",
            hidden: false,
            status: "active",
            deprecation_date: null,
            retirement_date: null,
        },
    ];

    const capabilityRows = [
        {
            provider_api_model_id: "pm_openai_a",
            params: {},
            max_input_tokens: 16_000,
            max_output_tokens: 2_048,
            status: "active",
            updated_at: "2026-05-01T00:00:00Z",
            created_at: "2026-05-01T00:00:00Z",
        },
        {
            provider_api_model_id: "pm_openai_b",
            params: {},
            max_input_tokens: 64_000,
            max_output_tokens: 8_192,
            status: "active",
            updated_at: "2026-05-02T00:00:00Z",
            created_at: "2026-05-02T00:00:00Z",
        },
        {
            provider_api_model_id: "pm_google_a",
            params: {},
            max_input_tokens: 32_000,
            max_output_tokens: 4_096,
            status: "active",
            updated_at: "2026-05-01T00:00:00Z",
            created_at: "2026-05-01T00:00:00Z",
        },
    ];

    const from = vi.fn((table: string) => {
        if (table === "data_api_provider_models") {
            return {
                select: () => ({
                    eq: () => ({
                        like: async () => ({
                            data: freeProviderModels,
                            error: null,
                        }),
                    }),
                }),
            };
        }
        if (table === "data_models") {
            return {
                select: () => ({
                    in: async () => ({
                        data: dataModels,
                        error: null,
                    }),
                }),
            };
        }
        if (table === "data_api_provider_model_capabilities") {
            return {
                select: () => ({
                    eq: () => ({
                        in: () => ({
                            in: async () => ({
                                data: capabilityRows,
                                error: null,
                            }),
                        }),
                    }),
                }),
            };
        }
        if (table === "data_api_providers") {
            return {
                select: () => ({
                    in: async () => ({
                        data: [
                            { api_provider_id: "openai", status: "active", routing_status: "active" },
                            { api_provider_id: "google-ai-studio", status: "active", routing_status: "active" },
                        ],
                        error: null,
                    }),
                }),
            };
        }
        if (table === "workspace_settings") {
            return {
                select: () => ({
                    eq: () => ({
                        maybeSingle: async () => ({
                            data: {
                                routing_mode: null,
                                byok_fallback_enabled: null,
                                beta_channel_enabled: false,
                                alpha_channel_enabled: false,
                                cache_aware_routing_enabled: true,
                            },
                            error: null,
                        }),
                    }),
                }),
            };
        }
        if (table === "workspaces") {
            return {
                select: () => ({
                    eq: () => ({
                        maybeSingle: async () => ({
                            data: { billing_mode: "wallet" },
                            error: null,
                        }),
                    }),
                }),
            };
        }
        throw new Error(`Unexpected table: ${table}`);
    });

    return {
        cache,
        supabase: { rpc, from },
    };
});

const loadPriceCardMock = vi.hoisted(() => vi.fn());

vi.mock("@/runtime/env", () => ({
    getCache: () => runtime.cache as unknown as KVNamespace,
    getSupabaseAdmin: () => runtime.supabase,
}));

vi.mock("@pipeline/pricing", () => ({
    loadPriceCard: (...args: any[]) => loadPriceCardMock(...args),
}));

describe("fetchGatewayContext free router", () => {
    beforeEach(() => {
        runtime.cache.get.mockClear();
        runtime.cache.put.mockClear();
        runtime.cache.delete.mockClear();
        runtime.supabase.rpc.mockClear();
        runtime.supabase.from.mockClear();
        loadPriceCardMock.mockReset();
        loadPriceCardMock.mockImplementation(async (providerId: string, model: string, endpoint: string) => ({
            provider: providerId,
            model,
            endpoint,
            effective_from: null,
            effective_to: null,
            currency: "USD",
            version: "1",
            rules: [
                {
                    pricing_plan: "free",
                    meter: "input_text_tokens",
                    unit: "token",
                    unit_size: 1,
                    price_per_unit: "0",
                    currency: "USD",
                    match: [],
                    priority: 1,
                },
            ],
        }));
        vi.resetModules();
    });

    it("builds a model-granular free pool using concrete free model pricing", async () => {
        const { fetchGatewayContext } = await import("./context");
        const context = await fetchGatewayContext({
            workspaceId: "team_free",
            model: "ai-stats/free",
            endpoint: "text.generate",
            apiKeyId: "key_free",
            disableCache: true,
        });

        expect(context.resolvedModel).toBe("ai-stats/free");
        expect(context.providers).toHaveLength(3);
        expect(context.providers).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    providerId: "openai",
                    apiModelId: "openai/gpt-free-a",
                    pricingKey: "openai:openai/gpt-free-a",
                    providerModelSlug: "gpt-free-a",
                }),
                expect.objectContaining({
                    providerId: "openai",
                    apiModelId: "openai/gpt-free-b",
                    pricingKey: "openai:openai/gpt-free-b",
                    providerModelSlug: "gpt-free-b",
                }),
                expect.objectContaining({
                    providerId: "google-ai-studio",
                    apiModelId: "google/gemini-free",
                    pricingKey: "google-ai-studio:google/gemini-free",
                    providerModelSlug: "gemini-free",
                }),
            ]),
        );
        expect(Object.keys(context.pricing).sort()).toEqual([
            "google-ai-studio:google/gemini-free",
            "openai:openai/gpt-free-a",
            "openai:openai/gpt-free-b",
        ]);
        expect(loadPriceCardMock).toHaveBeenCalledWith("openai", "openai/gpt-free-a", "text.generate");
        expect(loadPriceCardMock).toHaveBeenCalledWith("openai", "openai/gpt-free-b", "text.generate");
        expect(loadPriceCardMock).toHaveBeenCalledWith("google-ai-studio", "google/gemini-free", "text.generate");
    });
});
