import { describe, test, expect } from "vitest";
import type { ProviderPricing } from "@/lib/fetchers/models/getModelPricing";
import { getPricingProviderVariantLabels } from "@/components/(data)/model/pricing/pricingProviderVariants";

function makeProviderPricing(
	overrides: Partial<ProviderPricing>,
): ProviderPricing {
	return {
		provider: {
			api_provider_id: "anthropic",
			api_provider_name: "Anthropic",
			provider_family_id: "anthropic",
			offer_label: null,
			offer_scope: "global",
		},
		provider_models: [
			{
				id: "pm-1",
				api_provider_id: "anthropic",
				model_id: "anthropic/claude-opus-5",
				endpoint: "text.generate",
				is_active_gateway: true,
				input_modalities: "text",
				output_modalities: "text",
			},
		],
		pricing_rules: [
			{
				id: "rule-1",
				model_key: "anthropic:anthropic/claude-opus-5:text.generate",
				pricing_plan: "standard",
				meter: "input_text_tokens",
				unit: "token",
				unit_size: 1000000,
				price_per_unit: 5,
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

describe("getPricingProviderVariantLabels", () => {
	test("hides the lone standard label for a non-variant provider card", () => {
		const provider = makeProviderPricing({});

		expect(
			getPricingProviderVariantLabels({
				displayProvider: provider,
				sourceProviders: [provider],
			}),
		).toEqual([]);
	});

	test("surfaces merged Anthropic offer variants on a family card", () => {
		const anthropic = makeProviderPricing({});
		const anthropicUs = makeProviderPricing({
			provider: {
				api_provider_id: "anthropic-us",
				api_provider_name: "Anthropic",
				provider_family_id: "anthropic",
				offer_label: "US",
				offer_scope: "regional",
			},
			provider_models: [
				{
					id: "pm-2",
					api_provider_id: "anthropic-us",
					model_id: "anthropic/claude-opus-5",
					endpoint: "text.generate",
					is_active_gateway: true,
					input_modalities: "text",
					output_modalities: "text",
				},
			],
			pricing_rules: [
				{
					id: "rule-2",
					model_key: "anthropic-us:anthropic/claude-opus-5:text.generate",
					pricing_plan: "standard",
					meter: "input_text_tokens",
					unit: "token",
					unit_size: 1000000,
					price_per_unit: 5.5,
					currency: "USD",
					note: null,
					match: [],
					priority: 100,
					effective_from: "2026-01-01T00:00:00.000Z",
					effective_to: null,
				},
			],
		});
		const anthropicAws = makeProviderPricing({
			provider: {
				api_provider_id: "anthropic-aws",
				api_provider_name: "Anthropic",
				provider_family_id: "anthropic",
				offer_label: "AWS",
				offer_scope: "specialized",
			},
			provider_models: [
				{
					id: "pm-3",
					api_provider_id: "anthropic-aws",
					model_id: "anthropic/claude-opus-5",
					endpoint: "text.generate",
					is_active_gateway: true,
					input_modalities: "text",
					output_modalities: "text",
				},
			],
			pricing_rules: [
				{
					id: "rule-3",
					model_key: "anthropic-aws:anthropic/claude-opus-5:text.generate",
					pricing_plan: "standard",
					meter: "input_text_tokens",
					unit: "token",
					unit_size: 1000000,
					price_per_unit: 5.75,
					currency: "USD",
					note: null,
					match: [],
					priority: 100,
					effective_from: "2026-01-01T00:00:00.000Z",
					effective_to: null,
				},
			],
		});

		const mergedDisplayProvider = makeProviderPricing({
			provider_models: [
				...anthropic.provider_models,
				...anthropicUs.provider_models,
				...anthropicAws.provider_models,
			],
			pricing_rules: [
				...anthropic.pricing_rules,
				...anthropicUs.pricing_rules,
				...anthropicAws.pricing_rules,
			],
		});

		expect(
			getPricingProviderVariantLabels({
				displayProvider: mergedDisplayProvider,
				sourceProviders: [anthropic, anthropicUs, anthropicAws],
			}),
		).toEqual(["Standard", "US", "AWS"]);
	});

	test("hides the variant row for standalone regional offers", () => {
		const anthropicUs = makeProviderPricing({
			provider: {
				api_provider_id: "anthropic-us",
				api_provider_name: "Anthropic",
				provider_family_id: "anthropic",
				offer_label: "US",
				offer_scope: "regional",
			},
			provider_models: [
				{
					id: "pm-2",
					api_provider_id: "anthropic-us",
					model_id: "anthropic/claude-opus-5",
					endpoint: "text.generate",
					is_active_gateway: true,
					input_modalities: "text",
					output_modalities: "text",
				},
			],
			pricing_rules: [
				{
					id: "rule-2",
					model_key: "anthropic-us:anthropic/claude-opus-5:text.generate",
					pricing_plan: "standard",
					meter: "input_text_tokens",
					unit: "token",
					unit_size: 1000000,
					price_per_unit: 5.5,
					currency: "USD",
					note: null,
					match: [],
					priority: 100,
					effective_from: "2026-01-01T00:00:00.000Z",
					effective_to: null,
				},
			],
		});

		expect(
			getPricingProviderVariantLabels({
				displayProvider: anthropicUs,
				sourceProviders: [anthropicUs],
			}),
		).toEqual([]);
	});

	test("ignores the offer of a provider whose only route is retired", () => {
		const moonshotModel = (id: string, providerId: string, extra = {}) => ({
			id,
			api_provider_id: providerId,
			model_id: "moonshotai/kimi-k2.7-code",
			endpoint: "text.generate",
			is_active_gateway: false,
			input_modalities: "text",
			output_modalities: "text",
			...extra,
		});
		const moonshot = makeProviderPricing({
			provider: { api_provider_id: "moonshotai", api_provider_name: "Moonshot AI", provider_family_id: "moonshotai", offer_label: null, offer_scope: "global" },
			provider_models: [
				moonshotModel("pm-1", "moonshotai"),
				moonshotModel("pm-2", "moonshotai-turbo", { routing_status: "retired", provider_availability_status: "removed" }),
			],
			pricing_rules: [],
		});
		const turbo = makeProviderPricing({
			provider: { api_provider_id: "moonshotai-turbo", api_provider_name: "Moonshot AI Turbo", provider_family_id: "moonshotai", offer_label: "priority", offer_scope: "specialized" },
			provider_models: [],
			pricing_rules: [],
		});

		expect(getPricingProviderVariantLabels({ displayProvider: moonshot, sourceProviders: [moonshot, turbo] })).toEqual([]);
		const live = { ...moonshot, provider_models: [moonshotModel("pm-1", "moonshotai"), moonshotModel("pm-2", "moonshotai-turbo")] };
		expect(getPricingProviderVariantLabels({ displayProvider: live, sourceProviders: [live, turbo] })).toHaveLength(2);
	});
});
