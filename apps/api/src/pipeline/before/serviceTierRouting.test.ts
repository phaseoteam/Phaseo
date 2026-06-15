import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PriceCard } from "../pricing/types";
import { applyServiceTierRouting } from "./serviceTierRouting";

const queryState = vi.hoisted(() => ({
    providerRows: [] as any[],
    capabilityRows: [] as any[],
    providerFilters: {} as Record<string, unknown>,
}));

const loadPriceCardMock = vi.hoisted(() => vi.fn());

vi.mock("@/runtime/env", () => ({
    getSupabaseAdmin: () => ({
        from: (table: string) => {
            if (table === "data_api_provider_models") {
                return {
                    select: () => {
                        const builder: any = {
                            eq: (_column: string, _value: unknown) => builder,
                        };
                        builder.eq = (column: string, value: unknown) => {
                            queryState.providerFilters[column] = value;
                            if (column === "is_active_gateway") {
                                const rows = queryState.providerRows.filter((row) =>
                                    Object.entries(queryState.providerFilters).every(
                                        ([filterColumn, filterValue]) =>
                                            row[filterColumn as keyof typeof row] === filterValue,
                                    ),
                                );
                                return Promise.resolve({
                                    data: rows,
                                    error: null,
                                });
                            }
                            return builder;
                        };
                        return builder;
                    },
                };
            }

            if (table === "data_api_provider_model_capabilities") {
                return {
                    select: () => {
                        const builder: any = {
                            eq: (_column: string, _value: unknown) => builder,
                            in: (_column: string, _value: unknown) => builder,
                        };
                        builder.in = (column: string, _value: unknown) => {
                            if (column === "provider_api_model_id") {
                                return Promise.resolve({
                                    data: queryState.capabilityRows,
                                    error: null,
                                });
                            }
                            return builder;
                        };
                        return builder;
                    },
                };
            }

            throw new Error(`Unexpected table: ${table}`);
        },
    }),
}));

vi.mock("@pipeline/pricing", () => ({
    loadPriceCard: (...args: any[]) => loadPriceCardMock(...args),
}));

function makeCard(args: {
    provider: string;
    model: string;
    plans: Array<"standard" | "priority" | "batch" | "flex">;
}): PriceCard {
    return {
        provider: args.provider,
        model: args.model,
        endpoint: "text.generate",
        effective_from: null,
        effective_to: null,
        currency: "USD",
        version: null,
        rules: args.plans.map((plan, index) => ({
            id: `${plan}-${index}`,
            pricing_plan: plan,
            meter: index % 2 === 0 ? "input_text_tokens" : "output_text_tokens",
            unit: "token",
            unit_size: 1_000_000,
            price_per_unit: plan === "priority" ? "10" : "5",
            currency: "USD",
            match: [],
            priority: 100,
        })),
    };
}

function makeCandidate(args: {
    providerId: string;
    apiModelId?: string | null;
    providerModelSlug?: string | null;
    pricingCard: PriceCard | null;
    offerScope?: "global" | "regional" | "specialized" | null;
    offerLabel?: string | null;
}): any {
    return {
        providerId: args.providerId,
        apiModelId: args.apiModelId ?? null,
        pricingKey: args.apiModelId ? `${args.providerId}:${args.apiModelId}` : args.providerId,
        providerModelSlug: args.providerModelSlug ?? null,
        pricingCard: args.pricingCard,
        offerScope: args.offerScope ?? null,
        offerLabel: args.offerLabel ?? null,
        capabilityParams: {},
        maxInputTokens: null,
        maxOutputTokens: null,
    };
}

describe("applyServiceTierRouting", () => {
    beforeEach(() => {
        queryState.providerRows = [];
        queryState.capabilityRows = [];
        queryState.providerFilters = {};
        loadPriceCardMock.mockReset();
    });

    it("filters priority requests to providers with direct priority support", async () => {
        const result = await applyServiceTierRouting({
            candidates: [
                makeCandidate({
                    providerId: "anthropic",
                    apiModelId: "anthropic/claude-opus-4.8",
                    providerModelSlug: "claude-opus-4-8",
                    pricingCard: makeCard({
                        provider: "anthropic",
                        model: "anthropic/claude-opus-4.8",
                        plans: ["standard", "priority"],
                    }),
                }),
                makeCandidate({
                    providerId: "anthropic-aws",
                    apiModelId: "anthropic/claude-opus-4.8",
                    providerModelSlug: "claude-opus-4-8",
                    pricingCard: makeCard({
                        provider: "anthropic-aws",
                        model: "anthropic/claude-opus-4.8",
                        plans: ["standard"],
                    }),
                }),
            ],
            body: { service_tier: "priority" },
            capability: "text.generate",
        });

        expect(result.candidates.map((candidate) => candidate.providerId)).toEqual(["anthropic"]);
        expect(result.diagnostics.droppedProviders).toMatchObject([
            {
                providerId: "anthropic-aws",
                reason: "service_tier_priority_unsupported",
            },
        ]);
        expect(loadPriceCardMock).not.toHaveBeenCalled();
    });

    it("does not treat text speed as a service tier alias", async () => {
        const result = await applyServiceTierRouting({
            candidates: [
                makeCandidate({
                    providerId: "anthropic",
                    apiModelId: "anthropic/claude-opus-4.8",
                    pricingCard: makeCard({
                        provider: "anthropic",
                        model: "anthropic/claude-opus-4.8",
                        plans: ["standard", "priority"],
                    }),
                }),
                makeCandidate({
                    providerId: "anthropic-aws",
                    apiModelId: "anthropic/claude-opus-4.8",
                    pricingCard: makeCard({
                        provider: "anthropic-aws",
                        model: "anthropic/claude-opus-4.8",
                        plans: ["standard"],
                    }),
                }),
            ],
            body: { speed: "fast" },
            capability: "text.generate",
        });

        expect(result.candidates.map((candidate) => candidate.providerId)).toEqual([
            "anthropic",
            "anthropic-aws",
        ]);
        expect(result.diagnostics.requestedTier).toBeNull();
    });

    it("keeps dedicated priority offers even when they use standard-priced sibling cards", async () => {
        const result = await applyServiceTierRouting({
            candidates: [
                makeCandidate({
                    providerId: "anthropic-priority",
                    apiModelId: "anthropic/claude-opus-4.8",
                    providerModelSlug: "claude-opus-4-8",
                    pricingCard: makeCard({
                        provider: "anthropic-priority",
                        model: "anthropic/claude-opus-4.8",
                        plans: ["standard"],
                    }),
                    offerScope: "specialized",
                    offerLabel: "priority",
                }),
            ],
            body: { service_tier: "priority" },
            capability: "text.generate",
        });

        expect(result.candidates).toHaveLength(1);
        expect(result.candidates[0].providerId).toBe("anthropic-priority");
        expect(result.diagnostics.droppedProviders).toEqual([]);
        expect(loadPriceCardMock).not.toHaveBeenCalled();
    });

    it("remaps Venice priority requests to the hidden fast sibling slug while keeping the public model stable", async () => {
        queryState.providerRows = [
            {
                provider_id: "venice",
                api_model_id: "anthropic/claude-opus-4.8-fast",
                provider_api_model_id: "venice-fast-pam",
                provider_model_slug: "claude-opus-4-8-fast",
                is_active_gateway: false,
                effective_from: "2026-05-29T00:00:00Z",
                effective_to: null,
            },
        ];
        queryState.capabilityRows = [
            {
                provider_api_model_id: "venice-fast-pam",
                params: { reasoning: true },
                max_input_tokens: 1_000_000,
                max_output_tokens: 128_000,
                status: "active",
                updated_at: "2026-05-29T00:00:00Z",
                created_at: "2026-05-29T00:00:00Z",
            },
        ];
        const result = await applyServiceTierRouting({
            candidates: [
                makeCandidate({
                    providerId: "venice",
                    apiModelId: "anthropic/claude-opus-4.8",
                    providerModelSlug: "claude-opus-4-8",
                    pricingCard: makeCard({
                        provider: "venice",
                        model: "anthropic/claude-opus-4.8",
                        plans: ["standard", "priority"],
                    }),
                }),
            ],
            body: { service_tier: "priority" },
            capability: "text.generate",
        });

        expect(loadPriceCardMock).not.toHaveBeenCalled();
        expect(result.candidates).toHaveLength(1);
        expect(result.candidates[0]).toMatchObject({
            providerId: "venice",
            apiModelId: "anthropic/claude-opus-4.8",
            pricingKey: "venice:anthropic/claude-opus-4.8",
            providerModelSlug: "claude-opus-4-8-fast",
            maxInputTokens: 1_000_000,
            maxOutputTokens: 128_000,
            capabilityParams: { reasoning: true },
        });
        expect(result.diagnostics.remappedProviders).toMatchObject([
            {
                providerId: "venice",
                fromApiModelId: "anthropic/claude-opus-4.8",
                toApiModelId: "anthropic/claude-opus-4.8-fast",
                reason: "priority_fast_sibling",
            },
        ]);
    });

    it("remaps Moonshot K2.7 Code priority requests to the hidden HighSpeed slug while keeping the public model stable", async () => {
        queryState.providerRows = [
            {
                provider_id: "moonshotai",
                api_model_id: "moonshotai/kimi-k2.7-code-highspeed",
                provider_api_model_id: "moonshot-highspeed-pam",
                provider_model_slug: "kimi-k2.7-code-highspeed",
                is_active_gateway: false,
                effective_from: "2026-06-12T00:00:00Z",
                effective_to: null,
            },
        ];
        queryState.capabilityRows = [
            {
                provider_api_model_id: "moonshot-highspeed-pam",
                params: { thinking: true },
                max_input_tokens: 262_144,
                max_output_tokens: 65_536,
                status: "active",
                updated_at: "2026-06-12T00:00:00Z",
                created_at: "2026-06-12T00:00:00Z",
            },
        ];

        const result = await applyServiceTierRouting({
            candidates: [
                makeCandidate({
                    providerId: "moonshotai",
                    apiModelId: "moonshotai/kimi-k2.7-code",
                    providerModelSlug: "kimi-k2.7-code",
                    pricingCard: makeCard({
                        provider: "moonshotai",
                        model: "moonshotai/kimi-k2.7-code",
                        plans: ["standard", "priority"],
                    }),
                }),
            ],
            body: { service_tier: "priority" },
            capability: "text.generate",
        });

        expect(loadPriceCardMock).not.toHaveBeenCalled();
        expect(result.candidates).toHaveLength(1);
        expect(result.candidates[0]).toMatchObject({
            providerId: "moonshotai",
            apiModelId: "moonshotai/kimi-k2.7-code",
            pricingKey: "moonshotai:moonshotai/kimi-k2.7-code",
            providerModelSlug: "kimi-k2.7-code-highspeed",
            maxInputTokens: 262_144,
            maxOutputTokens: 65_536,
            capabilityParams: { thinking: true },
        });
        expect(result.diagnostics.remappedProviders).toMatchObject([
            {
                providerId: "moonshotai",
                fromApiModelId: "moonshotai/kimi-k2.7-code",
                toApiModelId: "moonshotai/kimi-k2.7-code-highspeed",
                reason: "priority_fast_sibling",
            },
        ]);
    });

    it("remaps flex requests to the flex sibling model when pricing is exposed that way", async () => {
        queryState.providerRows = [
            {
                provider_id: "google-ai-studio",
                api_model_id: "google/gemini-3-pro-image-flex",
                provider_api_model_id: "provider-flex-pam",
                provider_model_slug: "gemini-3-pro-image-flex",
                is_active_gateway: true,
                effective_from: "2026-05-29T00:00:00Z",
                effective_to: null,
            },
        ];
        queryState.capabilityRows = [
            {
                provider_api_model_id: "provider-flex-pam",
                params: { mode: "flex" },
                max_input_tokens: 2_000_000,
                max_output_tokens: 64_000,
                status: "active",
                updated_at: "2026-05-29T00:00:00Z",
                created_at: "2026-05-29T00:00:00Z",
            },
        ];
        const siblingCard = makeCard({
            provider: "google-ai-studio",
            model: "google/gemini-3-pro-image-flex",
            plans: ["standard"],
        });
        loadPriceCardMock.mockResolvedValue(siblingCard);

        const result = await applyServiceTierRouting({
            candidates: [
                makeCandidate({
                    providerId: "google-ai-studio",
                    apiModelId: "google/gemini-3-pro-image",
                    providerModelSlug: "gemini-3-pro-image",
                    pricingCard: makeCard({
                        provider: "google-ai-studio",
                        model: "google/gemini-3-pro-image",
                        plans: ["standard"],
                    }),
                }),
            ],
            body: { service_tier: "flex" },
            capability: "text.generate",
        });

        expect(loadPriceCardMock).toHaveBeenCalledWith(
            "google-ai-studio",
            "google/gemini-3-pro-image-flex",
            "text.generate",
        );
        expect(result.candidates[0]).toMatchObject({
            providerId: "google-ai-studio",
            apiModelId: "google/gemini-3-pro-image-flex",
            pricingKey: "google-ai-studio:google/gemini-3-pro-image-flex",
            providerModelSlug: "gemini-3-pro-image-flex",
            maxInputTokens: 2_000_000,
            maxOutputTokens: 64_000,
            capabilityParams: { mode: "flex" },
        });
        expect(result.diagnostics.remappedProviders).toMatchObject([
            {
                providerId: "google-ai-studio",
                fromApiModelId: "google/gemini-3-pro-image",
                toApiModelId: "google/gemini-3-pro-image-flex",
                reason: "flex_sibling",
            },
        ]);
    });

    it("does not classify missing pricing as service-tier unsupported", async () => {
        const result = await applyServiceTierRouting({
            candidates: [
                makeCandidate({
                    providerId: "venice",
                    apiModelId: "anthropic/claude-opus-4.8",
                    providerModelSlug: "claude-opus-4-8",
                    pricingCard: null,
                }),
            ],
            body: { service_tier: "priority" },
            capability: "text.generate",
        });

        expect(result.candidates).toHaveLength(1);
        expect(result.diagnostics.droppedProviders).toEqual([]);
        expect(loadPriceCardMock).not.toHaveBeenCalled();
    });
});
