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
            if (table === "v2_model_provider_routes" || table === "v2_route_capabilities") {
                const rows = table === "v2_model_provider_routes"
                    ? queryState.providerRows.map((row) => ({
                        ...row,
                        provider_model_id: row.provider_model_id ?? row.provider_api_model_id,
                        model_slug: row.model_slug ?? row.api_model_id,
                        routing_enabled: row.routing_enabled ?? row.is_active_gateway,
                    }))
                    : queryState.capabilityRows.map((row) => ({
                        ...row,
                        provider_model_id: row.provider_model_id ?? row.provider_api_model_id,
                    }));
                let filteredRows = rows;
                const builder: any = {
                    select: () => builder,
                    eq: () => builder,
                    in: () => builder,
                    or: (filter: string) => {
                        const values = filter
                            .split(",")
                            .map((clause) => clause.split(".eq.")[1])
                            .filter(Boolean);
                        filteredRows = filteredRows.filter((row) =>
                            values.includes(row.model_slug) || values.includes(row.provider_model_slug),
                        );
                        return builder;
                    },
                    then: (resolve: (value: unknown) => unknown) => resolve({ data: filteredRows, error: null }),
                };
                return builder;
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
    capabilityParams?: Record<string, any>;
}): any {
    return {
        providerId: args.providerId,
        apiModelId: args.apiModelId ?? null,
        pricingKey: args.apiModelId ? `${args.providerId}:${args.apiModelId}` : args.providerId,
        providerModelSlug: args.providerModelSlug ?? null,
        pricingCard: args.pricingCard,
        offerScope: args.offerScope ?? null,
        offerLabel: args.offerLabel ?? null,
        capabilityParams: args.capabilityParams ?? {},
        maxInputTokens: null,
        maxOutputTokens: null,
    };
}

describe("applyServiceTierRouting", () => {
    it.each(["on-demand", "llm-plus"])("preserves default routing for provider SKU %s", async (plan) => {
        const card = makeCard({ provider: "provider", model: "model", plans: ["standard"] });
        card.rules = card.rules.map((rule) => ({ ...rule, pricing_plan: plan }));
        const provider = makeCandidate({ providerId: "provider", pricingCard: card });
        expect((await applyServiceTierRouting({ candidates: [provider], body: {}, capability: "text.generate" })).candidates).toEqual([provider]);
    });
    it("preserves default routing for explicitly free cards", async () => {
        const card = makeCard({ provider: "free", model: "model", plans: ["standard"] });
        card.rules = card.rules.map((rule) => ({ ...rule, pricing_plan: "free", price_per_unit: "0" }));
        const free = makeCandidate({ providerId: "free", pricingCard: card });
        expect((await applyServiceTierRouting({ candidates: [free], body: {}, capability: "text.generate" })).candidates).toEqual([free]);
    });
    it.each([{}, { service_tier: "standard" }, { serviceTier: "standard" }])(
        "rejects a global priority-only route for a default request %j", async (body) => {
            const fast = makeCandidate({ providerId: "fireworks", apiModelId: "z-ai/glm-5.3",
                providerModelSlug: "accounts/fireworks/routers/glm-5p3-fast", offerScope: "global",
                pricingCard: makeCard({ provider: "fireworks", model: "z-ai/glm-5.3", plans: ["priority"] }) });
            const standard = makeCandidate({ providerId: "other", pricingCard: makeCard({ provider: "other", model: "z-ai/glm-5.3", plans: ["standard"] }) });
            const result = await applyServiceTierRouting({ candidates: [fast, standard], body, capability: "text.generate" });
            expect(result.candidates).toEqual([standard]);
        },
    );

    it.each(["fast", "priority"])("keeps a global priority-only route for an explicit %s request", async (tier) => {
        const fast = makeCandidate({ providerId: "fireworks", apiModelId: "z-ai/glm-5.3",
            pricingCard: makeCard({ provider: "fireworks", model: "z-ai/glm-5.3", plans: ["priority"] }) });
        const result = await applyServiceTierRouting({ candidates: [fast], body: { service_tier: tier }, capability: "text.generate" });
        expect(result.candidates).toEqual([fast]);
    });

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
                    apiModelId: "anthropic/claude-opus-5",
                    providerModelSlug: "claude-opus-5",
                    pricingCard: makeCard({
                        provider: "anthropic",
                        model: "anthropic/claude-opus-5",
                        plans: ["standard", "priority"],
                    }),
                }),
                makeCandidate({
                    providerId: "anthropic-aws",
                    apiModelId: "anthropic/claude-opus-5",
                    providerModelSlug: "claude-opus-5",
                    pricingCard: makeCard({
                        provider: "anthropic-aws",
                        model: "anthropic/claude-opus-5",
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

    it("keeps Mistral reference Priority pricing non-routable without an explicit capability", async () => {
        const pricingCard = makeCard({
            provider: "mistral",
            model: "mistral/mistral-large-3",
            plans: ["standard", "priority"],
        });
        const withoutEntitlement = makeCandidate({
            providerId: "mistral",
            apiModelId: "mistral/mistral-large-3",
            pricingCard,
        });
        const enabledModel = makeCandidate({
            providerId: "mistral",
            apiModelId: "z-ai/glm-5.2",
            pricingCard,
            capabilityParams: { service_tier: {} },
        });

        const result = await applyServiceTierRouting({
            candidates: [withoutEntitlement, enabledModel],
            body: { service_tier: "priority" },
            capability: "text.generate",
        });

        expect(result.candidates.map((candidate) => candidate.apiModelId)).toEqual(["z-ai/glm-5.2"]);
        expect(result.diagnostics.droppedProviders).toMatchObject([{
            apiModelId: "mistral/mistral-large-3",
            reason: "service_tier_priority_unsupported",
        }]);
    });

    it("does not treat text speed as a service tier alias", async () => {
        const result = await applyServiceTierRouting({
            candidates: [
                makeCandidate({
                    providerId: "anthropic",
                    apiModelId: "anthropic/claude-opus-5",
                    pricingCard: makeCard({
                        provider: "anthropic",
                        model: "anthropic/claude-opus-5",
                        plans: ["standard", "priority"],
                    }),
                }),
                makeCandidate({
                    providerId: "anthropic-aws",
                    apiModelId: "anthropic/claude-opus-5",
                    pricingCard: makeCard({
                        provider: "anthropic-aws",
                        model: "anthropic/claude-opus-5",
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
                    apiModelId: "anthropic/claude-opus-5",
                    providerModelSlug: "claude-opus-5",
                    pricingCard: makeCard({
                        provider: "anthropic-priority",
                        model: "anthropic/claude-opus-5",
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

    it("does not expose dedicated priority variants to standard or omitted tier requests", async () => {
        const dedicated = makeCandidate({
            providerId: "deepinfra",
            apiModelId: "openai/gpt-oss-120b",
            providerModelSlug: "openai/gpt-oss-120b-fast",
            pricingCard: makeCard({ provider: "deepinfra", model: "openai/gpt-oss-120b", plans: ["standard", "priority"] }),
            offerScope: "specialized",
            offerLabel: "priority",
        });
        const standard = makeCandidate({
            providerId: "deepinfra-standard",
            apiModelId: "openai/gpt-oss-120b",
            providerModelSlug: "openai/gpt-oss-120b",
            pricingCard: makeCard({ provider: "deepinfra-standard", model: "openai/gpt-oss-120b", plans: ["standard"] }),
        });

        for (const body of [{}, { service_tier: "standard" }]) {
            const result = await applyServiceTierRouting({ candidates: [dedicated, standard], body, capability: "text.generate" });
            expect(result.candidates.map((candidate) => candidate.providerId)).toEqual(["deepinfra-standard"]);
            expect(result.diagnostics.droppedProviders).toContainEqual(expect.objectContaining({
                providerId: "deepinfra",
                reason: "service_tier_priority_required",
            }));
        }
    });

    it("keeps canonical fast models on standard and omitted tiers", async () => {
        const canonicalFast = makeCandidate({
            providerId: "lightricks",
            apiModelId: "lightricks/ltx-2.5-fast",
            providerModelSlug: "ltx-2.5-fast",
            pricingCard: makeCard({ provider: "lightricks", model: "lightricks/ltx-2.5-fast", plans: ["standard"] }),
        });

        for (const body of [{}, { service_tier: "standard" }]) {
            const result = await applyServiceTierRouting({ candidates: [canonicalFast], body, capability: "video.generate" });
            expect(result.candidates).toEqual([canonicalFast]);
        }
    });

    it("remaps Venice priority requests to the hidden fast sibling slug while keeping the public model stable", async () => {
        queryState.providerRows = [
            {
                provider_id: "venice",
                api_model_id: "anthropic/claude-opus-5-fast",
                provider_api_model_id: "venice-fast-pam",
                provider_model_slug: "claude-opus-5-fast",
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
                    apiModelId: "anthropic/claude-opus-5",
                    providerModelSlug: "claude-opus-5",
                    pricingCard: makeCard({
                        provider: "venice",
                        model: "anthropic/claude-opus-5",
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
            apiModelId: "anthropic/claude-opus-5",
            pricingKey: "venice:anthropic/claude-opus-5:claude-opus-5-fast",
            providerModelSlug: "claude-opus-5-fast",
            maxInputTokens: 1_000_000,
            maxOutputTokens: 128_000,
            capabilityParams: { reasoning: true },
        });
        expect(result.diagnostics.remappedProviders).toMatchObject([
            {
                providerId: "venice",
                fromApiModelId: "anthropic/claude-opus-5",
                toApiModelId: "anthropic/claude-opus-5-fast",
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
            pricingKey: "moonshotai:moonshotai/kimi-k2.7-code:kimi-k2.7-code-highspeed",
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

    it("does not treat unrelated -highspeed models as priority siblings", async () => {
        const result = await applyServiceTierRouting({
            candidates: [
                makeCandidate({
                    providerId: "minimax",
                    apiModelId: "minimax/minimax-m2.5-highspeed",
                    providerModelSlug: "MiniMax-M2.5-highspeed",
                    pricingCard: makeCard({
                        provider: "minimax",
                        model: "minimax/minimax-m2.5-highspeed",
                        plans: ["standard"],
                    }),
                }),
            ],
            body: { service_tier: "priority" },
            capability: "text.generate",
        });

        expect(result.candidates).toHaveLength(0);
        expect(result.diagnostics.droppedProviders).toMatchObject([
            {
                providerId: "minimax",
                apiModelId: "minimax/minimax-m2.5-highspeed",
                reason: "service_tier_priority_unsupported",
            },
        ]);
        expect(loadPriceCardMock).not.toHaveBeenCalled();
    });

    it("remaps DeepInfra MiniMax M2.7 priority requests to the hidden Turbo slug while keeping the public model stable", async () => {
        queryState.providerRows = [
            {
                provider_id: "deepinfra",
                api_model_id: "minimax/minimax-m2.7",
                provider_api_model_id: "deepinfra-minimax-m2.7-turbo-pam",
                provider_model_slug: "MiniMaxAI/MiniMax-M2.7-Turbo",
                is_active_gateway: false,
                effective_from: "2026-06-15T00:00:00Z",
                effective_to: null,
            },
        ];
        queryState.capabilityRows = [
            {
                provider_api_model_id: "deepinfra-minimax-m2.7-turbo-pam",
                params: { reasoning: true },
                max_input_tokens: 196_608,
                max_output_tokens: 131_072,
                status: "active",
                updated_at: "2026-06-15T00:00:00Z",
                created_at: "2026-06-15T00:00:00Z",
            },
        ];

        const result = await applyServiceTierRouting({
            candidates: [
                makeCandidate({
                    providerId: "deepinfra",
                    apiModelId: "minimax/minimax-m2.7",
                    providerModelSlug: "MiniMaxAI/MiniMax-M2.7",
                    pricingCard: makeCard({
                        provider: "deepinfra",
                        model: "minimax/minimax-m2.7",
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
            providerId: "deepinfra",
            apiModelId: "minimax/minimax-m2.7",
            pricingKey: "deepinfra:minimax/minimax-m2.7:minimaxai/minimax-m2.7-turbo",
            providerModelSlug: "MiniMaxAI/MiniMax-M2.7-Turbo",
            maxInputTokens: 196_608,
            maxOutputTokens: 131_072,
            capabilityParams: { reasoning: true },
        });
        expect(result.diagnostics.remappedProviders).toMatchObject([
            {
                providerId: "deepinfra",
                fromApiModelId: "minimax/minimax-m2.7",
                toApiModelId: "minimax/minimax-m2.7",
                reason: "priority_fast_sibling",
            },
        ]);
    });

    it("remaps CrofAI priority requests to hidden same-model Lightning slugs", async () => {
        queryState.providerRows = [
            {
                provider_id: "crofai",
                api_model_id: "deepseek/deepseek-v4-pro",
                provider_api_model_id: "crofai-v4-pro-lightning-pam",
                provider_model_slug: "deepseek-v4-pro-lightning",
                is_active_gateway: false,
                effective_from: "2026-08-23T00:00:00Z",
                effective_to: null,
            },
            {
                provider_id: "crofai",
                api_model_id: "moonshotai/kimi-k2.5",
                provider_api_model_id: "crofai-kimi-k2.5-lightning-pam",
                provider_model_slug: "kimi-k2.5-lightning",
                is_active_gateway: false,
                effective_from: "2026-08-23T00:00:00Z",
                effective_to: null,
            },
        ];
        queryState.capabilityRows = [
            {
                provider_api_model_id: "crofai-v4-pro-lightning-pam",
                params: { reasoning: true },
                max_input_tokens: 1_000_000,
                max_output_tokens: 131_072,
                status: "active",
                updated_at: "2026-08-23T00:00:00Z",
                created_at: "2026-08-23T00:00:00Z",
            },
            {
                provider_api_model_id: "crofai-kimi-k2.5-lightning-pam",
                params: { reasoning: true },
                max_input_tokens: 131_072,
                max_output_tokens: 32_768,
                status: "active",
                updated_at: "2026-08-23T00:00:00Z",
                created_at: "2026-08-23T00:00:00Z",
            },
        ];

        const result = await applyServiceTierRouting({
            candidates: [
                makeCandidate({
                    providerId: "crofai",
                    apiModelId: "deepseek/deepseek-v4-pro",
                    providerModelSlug: "deepseek-v4-pro",
                    pricingCard: makeCard({
                        provider: "crofai",
                        model: "deepseek/deepseek-v4-pro",
                        plans: ["standard", "priority"],
                    }),
                }),
                makeCandidate({
                    providerId: "crofai",
                    apiModelId: "moonshotai/kimi-k2.5",
                    providerModelSlug: "kimi-k2.5",
                    pricingCard: makeCard({
                        provider: "crofai",
                        model: "moonshotai/kimi-k2.5",
                        plans: ["standard", "priority"],
                    }),
                }),
            ],
            body: { service_tier: "priority" },
            capability: "text.generate",
        });

        expect(loadPriceCardMock).not.toHaveBeenCalled();
        expect(result.candidates).toHaveLength(2);
        expect(result.candidates[0]).toMatchObject({
            providerId: "crofai",
            apiModelId: "deepseek/deepseek-v4-pro",
            pricingKey: "crofai:deepseek/deepseek-v4-pro:deepseek-v4-pro-lightning",
            providerModelSlug: "deepseek-v4-pro-lightning",
            maxInputTokens: 1_000_000,
            maxOutputTokens: 131_072,
            capabilityParams: { reasoning: true },
        });
        expect(result.diagnostics.remappedProviders[0]).toMatchObject({
            providerId: "crofai",
            toApiModelId: "deepseek/deepseek-v4-pro",
            reason: "priority_fast_sibling",
        });
        expect(result.candidates[1]).toMatchObject({
            providerId: "crofai",
            apiModelId: "moonshotai/kimi-k2.5",
            pricingKey: "crofai:moonshotai/kimi-k2.5:kimi-k2.5-lightning",
            providerModelSlug: "kimi-k2.5-lightning",
            maxInputTokens: 131_072,
            maxOutputTokens: 32_768,
        });
        expect(result.diagnostics.remappedProviders[1]).toMatchObject({
            providerId: "crofai",
            toApiModelId: "moonshotai/kimi-k2.5",
            reason: "priority_fast_sibling",
        });
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
            pricingKey: "google-ai-studio:google/gemini-3-pro-image-flex:gemini-3-pro-image-flex",
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

	it("drops a tier sibling when final-route workspace authorization rejects it", async () => {
		queryState.providerRows = [{
			provider_id: "google-ai-studio",
			api_model_id: "google/gemini-3-pro-image-flex",
			provider_api_model_id: "provider-flex-pam",
			provider_model_slug: "gemini-3-pro-image-flex",
			is_active_gateway: true,
			effective_from: "2026-05-29T00:00:00Z",
			effective_to: null,
		}];
		queryState.capabilityRows = [{
			provider_api_model_id: "provider-flex-pam",
			params: { data_policy: { tier: "logs", zdrEligibility: "ineligible" } },
			max_input_tokens: 2_000_000,
			max_output_tokens: 64_000,
			status: "active",
			updated_at: "2026-05-29T00:00:00Z",
			created_at: "2026-05-29T00:00:00Z",
		}];
		loadPriceCardMock.mockResolvedValue(makeCard({
			provider: "google-ai-studio",
			model: "google/gemini-3-pro-image-flex",
			plans: ["standard"],
		}));
		const authorizeRemappedCandidate = vi.fn(() => false);

		const result = await applyServiceTierRouting({
			candidates: [makeCandidate({
				providerId: "google-ai-studio",
				apiModelId: "google/gemini-3-pro-image",
				providerModelSlug: "gemini-3-pro-image",
				pricingCard: makeCard({ provider: "google-ai-studio", model: "google/gemini-3-pro-image", plans: ["standard"] }),
			})],
			body: { service_tier: "flex" },
			capability: "text.generate",
			authorizeRemappedCandidate,
		});

		expect(result.candidates).toEqual([]);
		expect(authorizeRemappedCandidate).toHaveBeenCalledWith(expect.objectContaining({
			apiModelId: "google/gemini-3-pro-image-flex",
			effectiveDataPolicy: expect.objectContaining({ tier: "logs", source: "capability" }),
		}));
		expect(result.diagnostics.droppedProviders[0]?.reason).toBe("service_tier_remap_not_authorized");
	});

    it("remaps Wafer K3 priority requests to the hidden Fast slug", async () => {
        queryState.providerRows = [{
            provider_id: "wafer", api_model_id: "moonshotai/kimi-k3-fast",
            provider_api_model_id: "wafer-k3-fast-pam", provider_model_slug: "Kimi-K3-Fast",
            is_active_gateway: false, effective_from: "2026-07-30T00:00:00Z", effective_to: null,
        }];
        queryState.capabilityRows = [{
            provider_api_model_id: "wafer-k3-fast-pam", params: { reasoning: true },
            max_input_tokens: 1_000_000, max_output_tokens: 262_144, status: "active",
            updated_at: "2026-07-30T00:00:00Z", created_at: "2026-07-30T00:00:00Z",
        }];
        const result = await applyServiceTierRouting({
            candidates: [makeCandidate({ providerId: "wafer", apiModelId: "moonshotai/kimi-k3", providerModelSlug: "Kimi-K3", pricingCard: makeCard({ provider: "wafer", model: "moonshotai/kimi-k3", plans: ["standard", "priority"] }) })],
            body: { service_tier: "priority" }, capability: "text.generate",
        });
        expect(result.candidates[0]).toMatchObject({ providerId: "wafer", apiModelId: "moonshotai/kimi-k3", pricingKey: "wafer:moonshotai/kimi-k3:kimi-k3-fast", providerModelSlug: "Kimi-K3-Fast", maxInputTokens: 1_000_000, maxOutputTokens: 262_144 });
        expect(result.diagnostics.remappedProviders[0]).toMatchObject({ providerId: "wafer", toApiModelId: "moonshotai/kimi-k3-fast", reason: "priority_fast_sibling" });
    });

    it("remaps CrofAI K3 flex requests to the hidden Eco slug", async () => {
        queryState.providerRows = [{
            provider_id: "crofai", api_model_id: "moonshotai/kimi-k3-flex",
            provider_api_model_id: "crof-k3-eco-pam", provider_model_slug: "kimi-k3-eco",
            is_active_gateway: false, effective_from: "2026-07-30T00:00:00Z", effective_to: null,
        }];
        queryState.capabilityRows = [{
            provider_api_model_id: "crof-k3-eco-pam", params: { reasoning: true },
            max_input_tokens: 1_000_000, max_output_tokens: 131_072, status: "active",
            updated_at: "2026-07-30T00:00:00Z", created_at: "2026-07-30T00:00:00Z",
        }];
        const result = await applyServiceTierRouting({
            candidates: [makeCandidate({ providerId: "crofai", apiModelId: "moonshotai/kimi-k3", providerModelSlug: "kimi-k3", pricingCard: makeCard({ provider: "crofai", model: "moonshotai/kimi-k3", plans: ["standard", "flex"] }) })],
            body: { service_tier: "flex" }, capability: "text.generate",
        });
        expect(result.candidates[0]).toMatchObject({ providerId: "crofai", apiModelId: "moonshotai/kimi-k3", pricingKey: "crofai:moonshotai/kimi-k3:kimi-k3-eco", providerModelSlug: "kimi-k3-eco", maxInputTokens: 1_000_000, maxOutputTokens: 131_072 });
        expect(result.diagnostics.remappedProviders[0]).toMatchObject({ providerId: "crofai", toApiModelId: "moonshotai/kimi-k3-flex", reason: "flex_sibling" });
    });

    it("does not classify missing pricing as service-tier unsupported", async () => {
        const result = await applyServiceTierRouting({
            candidates: [
                makeCandidate({
                    providerId: "venice",
                    apiModelId: "anthropic/claude-opus-5",
                    providerModelSlug: "claude-opus-5",
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
