import type { ProviderPricing } from "@/lib/fetchers/models/getModelPricing";
import {
    getProviderAvailablePlans,
    getProviderModelScopeForPlan,
    getProviderPricingRulesForPlan,
} from "@/components/(data)/model/pricing/providerPlanRouting";

function makeProviderPricing(): ProviderPricing {
    return {
        provider: {
            api_provider_id: "venice",
            api_provider_name: "Venice",
            provider_family_id: "venice",
            offer_label: null,
            offer_scope: "global",
            colour: null,
            link: null,
            country_code: null,
            residency_mode: "unknown",
            default_execution_regions: null,
            default_data_regions: null,
            zero_data_retention: "unknown",
            residency_source_url: null,
            residency_notes: null,
            regional_pricing_mode: "unknown",
            regional_pricing_uplift_percent: null,
            pricing_source_url: null,
            regional_pricing_notes: null,
            prompt_training_policy: null,
            prompt_training_notes: null,
            prompt_training_source_url: null,
            user_identifier_policy: null,
            user_identifier_notes: null,
            privacy_policy_url: null,
            terms_of_service_url: null,
        },
        provider_models: [
            {
                id: "venice:opus48",
                api_provider_id: "venice",
                provider_model_slug: "claude-opus-4-8",
                model_id: "anthropic/claude-opus-4.8",
                endpoint: "text.generate",
                capability_status: "active",
                is_active_gateway: true,
                input_modalities: "text,image",
                output_modalities: "text",
            },
            {
                id: "venice:opus48fast",
                api_provider_id: "venice",
                provider_model_slug: "claude-opus-4-8-fast",
                model_id: "anthropic/claude-opus-4.8-fast",
                endpoint: "text.generate",
                capability_status: "active",
                is_active_gateway: true,
                input_modalities: "text,image",
                output_modalities: "text",
            },
        ],
        pricing_rules: [
            {
                id: "std-base-input",
                model_key: "venice:anthropic/claude-opus-4.8:text.generate",
                pricing_plan: "standard",
                meter: "input_text_tokens",
                unit: "token",
                unit_size: 1000000,
                price_per_unit: 6,
                currency: "USD",
                note: null,
                match: [],
                priority: 100,
                effective_from: "2026-05-29T00:00:00Z",
                effective_to: null,
            },
            {
                id: "std-fast-input",
                model_key: "venice:anthropic/claude-opus-4.8-fast:text.generate",
                pricing_plan: "standard",
                meter: "input_text_tokens",
                unit: "token",
                unit_size: 1000000,
                price_per_unit: 12,
                currency: "USD",
                note: null,
                match: [],
                priority: 100,
                effective_from: "2026-05-29T00:00:00Z",
                effective_to: null,
            },
        ],
    };
}

describe("providerPlanRouting", () => {
    it("derives a priority plan from fast sibling model pricing", () => {
        const provider = makeProviderPricing();

        expect(getProviderAvailablePlans(provider)).toEqual(["standard", "priority"]);
        expect(
            getProviderPricingRulesForPlan(provider, "priority").map((rule) => rule.id),
        ).toEqual(["std-fast-input"]);
        expect(
            getProviderModelScopeForPlan(provider, "priority").map((model) => model.model_id),
        ).toEqual(["anthropic/claude-opus-4.8-fast"]);
    });
});
