import type { ProviderPricing } from "@/lib/fetchers/models/getModelPricing";
import {
    getProviderAvailablePlans,
    getProviderModelScopeForPlan,
	getProviderPlanComparisonBase,
    getProviderPricingRulesForPlan,
	hasSelectedAlternativeServiceTier,
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
                provider_model_slug: "claude-opus-5",
                model_id: "anthropic/claude-opus-5",
                endpoint: "text.generate",
                capability_status: "active",
                is_active_gateway: true,
                input_modalities: "text,image",
                output_modalities: "text",
            },
            {
                id: "venice:opus48fast",
                api_provider_id: "venice",
                provider_model_slug: "claude-opus-5-fast",
                model_id: "anthropic/claude-opus-5-fast",
                endpoint: "text.generate",
                capability_status: "active",
                is_active_gateway: false,
                input_modalities: "text,image",
                output_modalities: "text",
            },
        ],
        pricing_rules: [
            {
                id: "std-base-input",
                model_key: "venice:anthropic/claude-opus-5:text.generate",
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
                id: "prio-base-input",
                model_key: "venice:anthropic/claude-opus-5:text.generate",
                pricing_plan: "priority",
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
	it("keeps Standard as the multiplier baseline when Batch is selected globally", () => {
		expect(
			getProviderPlanComparisonBase(
				["standard", "priority", "flex", "batch"],
				"batch",
			),
		).toBe("standard");
		expect(hasSelectedAlternativeServiceTier("standard", "standard")).toBe(false);
		expect(hasSelectedAlternativeServiceTier("batch", "standard")).toBe(true);
	});

	it("falls back to the only available tier without treating it as an accent", () => {
		expect(getProviderPlanComparisonBase(["batch"], "batch")).toBe("batch");
		expect(getProviderPlanComparisonBase(["batch"], "standard")).toBe("batch");
		expect(hasSelectedAlternativeServiceTier("batch", "batch")).toBe(false);
	});

    it("prefers explicit priority pricing on the base model over hidden fast sibling rows", () => {
        const provider = makeProviderPricing();

        expect(getProviderAvailablePlans(provider)).toEqual(["standard", "priority"]);
        expect(
            getProviderPricingRulesForPlan(provider, "standard").map((rule) => rule.id),
        ).toEqual(["std-base-input"]);
        expect(
            getProviderPricingRulesForPlan(provider, "priority").map((rule) => rule.id),
        ).toEqual(["prio-base-input"]);
        expect(
            getProviderModelScopeForPlan(provider, "priority").map((model) => model.model_id),
        ).toEqual(["anthropic/claude-opus-5"]);
    });

    it("derives a flex plan from a flex sibling model when present", () => {
        const provider = makeProviderPricing();
        provider.provider_models.push({
            id: "venice:opus48flex",
            api_provider_id: "venice",
            provider_model_slug: "claude-opus-5-flex",
            model_id: "anthropic/claude-opus-5-flex",
            endpoint: "text.generate",
            capability_status: "active",
            is_active_gateway: true,
            input_modalities: "text,image",
            output_modalities: "text",
        });
        provider.pricing_rules.push({
            id: "std-flex-input",
            model_key: "venice:anthropic/claude-opus-5-flex:text.generate",
            pricing_plan: "standard",
            meter: "input_text_tokens",
            unit: "token",
            unit_size: 1000000,
            price_per_unit: 4,
            currency: "USD",
            note: null,
            match: [],
            priority: 100,
            effective_from: "2026-05-29T00:00:00Z",
            effective_to: null,
        });

        expect(getProviderAvailablePlans(provider)).toEqual(["standard", "priority", "flex"]);
        expect(
            getProviderPricingRulesForPlan(provider, "flex").map((rule) => rule.id),
        ).toEqual(["std-flex-input"]);
        expect(
            getProviderModelScopeForPlan(provider, "flex").map((model) => model.model_id),
        ).toEqual(["anthropic/claude-opus-5-flex"]);
    });

    it("shows explicit xAI batch pricing without requiring gateway batch execution support", () => {
        const provider = makeProviderPricing();
        provider.provider.api_provider_id = "spacex-ai";
        provider.provider.api_provider_name = "xAI";
        provider.provider.provider_family_id = "spacex-ai";
        provider.provider_models = [{
            ...provider.provider_models[0],
            id: "spacex-ai:spacex-ai/grok-4.3:text.generate",
            api_provider_id: "spacex-ai",
            model_id: "spacex-ai/grok-4.3",
            endpoint: "text.generate",
        }];
        provider.pricing_rules = [{
            ...provider.pricing_rules[0],
            id: "xai-grok-4.3-batch-input",
            model_key: "spacex-ai:spacex-ai/grok-4.3:text.generate",
            pricing_plan: "batch",
            price_per_unit: 1,
            note: "20% Batch API discount.",
        }];

        expect(getProviderAvailablePlans(provider)).toEqual(["batch"]);
        expect(getProviderPricingRulesForPlan(provider, "batch")).toEqual([
            expect.objectContaining({
                id: "xai-grok-4.3-batch-input",
                price_per_unit: 1,
            }),
        ]);
        expect(getProviderModelScopeForPlan(provider, "batch")).toEqual([
            expect.objectContaining({
                model_id: "spacex-ai/grok-4.3",
                endpoint: "text.generate",
            }),
        ]);
    });
});
