import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PriceCard } from "../pricing/types";
import { applyServiceTierRouting } from "./serviceTierRouting";

const queryState = vi.hoisted(() => ({
    providerRows: [] as any[],
    capabilityRows: [] as any[],
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
                        builder.eq = (column: string, _value: unknown) => {
                            if (column === "is_active_gateway") {
                                return Promise.resolve({
                                    data: queryState.providerRows,
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

    it("remaps Venice priority requests to the fast sibling model", async () => {
        queryState.providerRows = [
            {
                provider_api_model_id: "venice-fast-pam",
                provider_model_slug: "claude-opus-4-8-fast",
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
        const siblingCard = makeCard({
            provider: "venice",
            model: "anthropic/claude-opus-4.8-fast",
            plans: ["standard"],
        });
        loadPriceCardMock.mockResolvedValue(siblingCard);

        const result = await applyServiceTierRouting({
            candidates: [
                makeCandidate({
                    providerId: "venice",
                    apiModelId: "anthropic/claude-opus-4.8",
                    providerModelSlug: "claude-opus-4-8",
                    pricingCard: makeCard({
                        provider: "venice",
                        model: "anthropic/claude-opus-4.8",
                        plans: ["standard"],
                    }),
                }),
            ],
            body: { service_tier: "priority" },
            capability: "text.generate",
        });

        expect(loadPriceCardMock).toHaveBeenCalledWith(
            "venice",
            "anthropic/claude-opus-4.8-fast",
            "text.generate",
        );
        expect(result.candidates).toHaveLength(1);
        expect(result.candidates[0]).toMatchObject({
            providerId: "venice",
            apiModelId: "anthropic/claude-opus-4.8-fast",
            pricingKey: "venice:anthropic/claude-opus-4.8-fast",
            providerModelSlug: "claude-opus-4-8-fast",
            maxInputTokens: 1_000_000,
            maxOutputTokens: 128_000,
            capabilityParams: { reasoning: true },
        });
        expect(result.candidates[0].pricingCard).toBe(siblingCard);
        expect(result.diagnostics.remappedProviders).toMatchObject([
            {
                providerId: "venice",
                fromApiModelId: "anthropic/claude-opus-4.8",
                toApiModelId: "anthropic/claude-opus-4.8-fast",
                reason: "priority_fast_sibling",
            },
        ]);
    });

    it("remaps flex requests to the flex sibling model when pricing is exposed that way", async () => {
        queryState.providerRows = [
            {
                provider_api_model_id: "provider-flex-pam",
                provider_model_slug: "gemini-3-pro-image-flex",
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
});
