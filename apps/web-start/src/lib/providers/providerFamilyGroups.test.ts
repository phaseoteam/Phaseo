import type { ProviderPricing } from "@/lib/fetchers/models/getModelPricing";
import { mergeProviderPricingOffers } from "@/lib/providers/providerFamilyGroups";

function makeProviderPricing(
    overrides: Partial<ProviderPricing>,
): ProviderPricing {
    return {
        provider: {
            api_provider_id: "minimax",
            api_provider_name: "MiniMax",
            provider_family_id: "minimax",
            offer_label: null,
            offer_scope: "global",
        },
        provider_models: [
            {
                id: "pm-1",
                api_provider_id: "minimax",
                model_id: "minimax/minimax-m2.1",
                endpoint: "text.generate",
                is_active_gateway: true,
                input_modalities: "text",
                output_modalities: "text",
            },
        ],
        pricing_rules: [
            {
                id: "rule-1",
                model_key: "minimax:minimax/minimax-m2.1:text.generate",
                pricing_plan: "standard",
                meter: "input_text_tokens",
                unit: "token",
                unit_size: 1000000,
                price_per_unit: 0.3,
                currency: "USD",
                note: null,
                match: [],
                priority: 100,
                effective_from: "2026-01-01T00:00:00.000Z",
                effective_to: null,
            },
        ],
        ...overrides,
    };
}

describe("mergeProviderPricingOffers", () => {
    test("folds MiniMax Lightning into MiniMax priority pricing", () => {
        const merged = mergeProviderPricingOffers([
            makeProviderPricing({}),
            makeProviderPricing({
                provider: {
                    api_provider_id: "minimax-lightning",
                    api_provider_name: "MiniMax Lightning",
                    provider_family_id: "minimax",
                    offer_label: null,
                    offer_scope: null,
                },
                provider_models: [
                    {
                        id: "pm-2",
                        api_provider_id: "minimax-lightning",
                        model_id: "minimax/minimax-m2.1",
                        endpoint: "text.generate",
                        is_active_gateway: true,
                        input_modalities: "text",
                        output_modalities: "text",
                    },
                ],
                pricing_rules: [
                    {
                        id: "rule-2",
                        model_key:
                            "minimax-lightning:minimax/minimax-m2.1:text.generate",
                        pricing_plan: "standard",
                        meter: "output_text_tokens",
                        unit: "token",
                        unit_size: 1000000,
                        price_per_unit: 2.4,
                        currency: "USD",
                        note: null,
                        match: [],
                        priority: 100,
                        effective_from: "2026-01-01T00:00:00.000Z",
                        effective_to: null,
                    },
                ],
            }),
        ]);

        expect(merged).toHaveLength(1);
        expect(merged[0]?.provider.api_provider_id).toBe("minimax");
        expect(
            merged[0]?.pricing_rules.some(
                (rule) =>
                    rule.id === "rule-2" && rule.pricing_plan === "priority",
            ),
        ).toBe(true);
        expect(
            merged[0]?.provider_models.some(
                (model) => model.api_provider_id === "minimax-lightning",
            ),
        ).toBe(true);
    });

    test("does not fold regional offers into the base provider", () => {
        const merged = mergeProviderPricingOffers([
            makeProviderPricing({
                provider: {
                    api_provider_id: "openai",
                    api_provider_name: "OpenAI",
                    provider_family_id: "openai",
                    offer_label: null,
                    offer_scope: "global",
                },
            }),
            makeProviderPricing({
                provider: {
                    api_provider_id: "openai-eu",
                    api_provider_name: "OpenAI EU",
                    provider_family_id: "openai",
                    offer_label: null,
                    offer_scope: "regional",
                },
            }),
        ]);

        expect(merged).toHaveLength(2);
        expect(merged.map((provider) => provider.provider.api_provider_id)).toEqual(
            ["openai", "openai-eu"],
        );
    });
});
