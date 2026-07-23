import type { ProviderPricing } from "@/lib/fetchers/models/getModelPricing";
import { buildProviderSections } from "./pricingHelpers";

function makeProviderPricing(): ProviderPricing {
	return {
		provider: {
			api_provider_id: "openai",
			api_provider_name: "OpenAI",
			provider_family_id: "openai",
			offer_label: null,
			offer_scope: "global",
			colour: null,
			link: null,
			country_code: null,
			residency_mode: "unknown",
			default_execution_regions: null,
			default_data_regions: null,
			zero_data_retention: "optional",
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
				id: "openai:gpt-5.5:responses",
				api_provider_id: "openai",
				model_id: "openai/gpt-5.5",
				endpoint: "responses",
				capability_status: "active",
				is_active_gateway: true,
				input_modalities: "text",
				output_modalities: "text",
				context_length: 400000,
				max_input_tokens: 400000,
				max_output_tokens: 128000,
			},
			{
				id: "openai:gpt-5.5:batch",
				api_provider_id: "openai",
				model_id: "openai/gpt-5.5",
				endpoint: "batch",
				capability_status: "active",
				is_active_gateway: true,
				input_modalities: "text",
				output_modalities: "text",
				context_length: 400000,
				max_input_tokens: 400000,
				max_output_tokens: 128000,
			},
		],
		pricing_rules: [
			{
				id: "std-input-short",
				model_key: "openai:openai/gpt-5.5:responses",
				pricing_plan: "standard",
				meter: "input_text_tokens",
				unit: "token",
				unit_size: 1000000,
				price_per_unit: 5,
				currency: "USD",
				note: null,
				priority: 100,
				effective_from: "2026-01-01T00:00:00.000Z",
				effective_to: null,
				match: [{ path: "usage.input_tokens", op: "lte", value: 272000 }],
			},
			{
				id: "std-input-long",
				model_key: "openai:openai/gpt-5.5:responses",
				pricing_plan: "standard",
				meter: "input_text_tokens",
				unit: "token",
				unit_size: 1000000,
				price_per_unit: 10,
				currency: "USD",
				note: null,
				priority: 100,
				effective_from: "2026-01-01T00:00:00.000Z",
				effective_to: null,
				match: [{ path: "usage.input_tokens", op: "gt", value: 272000 }],
			},
			{
				id: "prio-input-short",
				model_key: "openai:openai/gpt-5.5:responses",
				pricing_plan: "priority",
				meter: "input_text_tokens",
				unit: "token",
				unit_size: 1000000,
				price_per_unit: 12.5,
				currency: "USD",
				note: null,
				priority: 100,
				effective_from: "2026-01-01T00:00:00.000Z",
				effective_to: null,
				match: [{ path: "usage.input_tokens", op: "lt", value: 272001 }],
			},
			{
				id: "prio-input-long",
				model_key: "openai:openai/gpt-5.5:responses",
				pricing_plan: "priority",
				meter: "input_text_tokens",
				unit: "token",
				unit_size: 1000000,
				price_per_unit: 25,
				currency: "USD",
				note: null,
				priority: 100,
				effective_from: "2026-01-01T00:00:00.000Z",
				effective_to: null,
				match: [{ path: "usage.input_tokens", op: "gte", value: 272001 }],
			},
		],
	};
}

describe("buildProviderSections", () => {
	test("matches priority context ranges to standard pricing semantically", () => {
		const sections = buildProviderSections(makeProviderPricing(), "priority");
		const inputTiers = sections.textTokens?.in ?? [];

		expect(inputTiers).toHaveLength(2);
		expect(inputTiers[0]).toMatchObject({
			per1M: 12.5,
			basePer1M: 5,
			comparisonKind: "vs-standard",
			comparisonDirection: "pricier",
			label: "< 272k",
		});
		expect(inputTiers[1]).toMatchObject({
			per1M: 25,
			basePer1M: 10,
			comparisonKind: "vs-standard",
			comparisonDirection: "pricier",
			label: "≥ 272k",
		});
	});

	test("compares batch thresholds with standard defaults and near-equivalent bounds", () => {
		const provider = makeProviderPricing();
		provider.pricing_rules = [
			{
				id: "std-input-default",
				model_key: "openai:openai/gpt-5.5:responses",
				pricing_plan: "standard",
				meter: "input_text_tokens",
				unit: "token",
				unit_size: 1_000_000,
				price_per_unit: 5,
				currency: "USD",
				note: null,
				priority: 100,
				effective_from: "2026-01-01T00:00:00.000Z",
				effective_to: null,
				match: [],
			},
			{
				id: "std-input-long",
				model_key: "openai:openai/gpt-5.5:responses",
				pricing_plan: "standard",
				meter: "input_text_tokens",
				unit: "token",
				unit_size: 1_000_000,
				price_per_unit: 10,
				currency: "USD",
				note: null,
				priority: 100,
				effective_from: "2026-01-01T00:00:00.000Z",
				effective_to: null,
				match: [{ path: "input_tokens", op: "gt", value: 272000 }],
			},
			{
				id: "batch-input-short",
				model_key: "openai:openai/gpt-5.5:batch",
				pricing_plan: "batch",
				meter: "input_text_tokens",
				unit: "token",
				unit_size: 1_000_000,
				price_per_unit: 2.5,
				currency: "USD",
				note: null,
				priority: 100,
				effective_from: "2026-01-01T00:00:00.000Z",
				effective_to: null,
				match: [
					{
						path: "input_tokens",
						op: "lt",
						value: 272000,
						or_group: 1,
						and_index: 1,
					},
				],
			},
			{
				id: "batch-input-long",
				model_key: "openai:openai/gpt-5.5:batch",
				pricing_plan: "batch",
				meter: "input_text_tokens",
				unit: "token",
				unit_size: 1_000_000,
				price_per_unit: 5,
				currency: "USD",
				note: null,
				priority: 100,
				effective_from: "2026-01-01T00:00:00.000Z",
				effective_to: null,
				match: [
					{
						path: "input_tokens",
						op: "gte",
						value: 272000,
						or_group: 1,
						and_index: 1,
					},
				],
			},
		];

		const inputTiers = buildProviderSections(provider, "batch").textTokens?.in ?? [];

		expect(inputTiers).toHaveLength(2);
		expect(inputTiers[0]).toMatchObject({
			per1M: 2.5,
			basePer1M: 5,
			comparisonKind: "vs-standard",
		});
		expect(inputTiers[1]).toMatchObject({
			per1M: 5,
			basePer1M: 10,
			comparisonKind: "vs-standard",
		});
	});

	test("keeps hidden fast sibling standard pricing out of the standard view", () => {
		const provider = makeProviderPricing();
		provider.provider.api_provider_id = "venice";
		provider.provider.api_provider_name = "Venice";
		provider.provider.provider_family_id = "venice";
		provider.provider_models = [
			{
				id: "venice:anthropic/claude-opus-4.8:text.generate",
				api_provider_id: "venice",
				model_id: "anthropic/claude-opus-4.8",
				provider_model_slug: "claude-opus-4-8",
				endpoint: "text.generate",
				capability_status: "active",
				is_active_gateway: true,
				input_modalities: "text,image",
				output_modalities: "text",
				context_length: 1_000_000,
				max_input_tokens: 1_000_000,
				max_output_tokens: 128_000,
			},
			{
				id: "venice:anthropic/claude-opus-4.8-fast:text.generate",
				api_provider_id: "venice",
				model_id: "anthropic/claude-opus-4.8-fast",
				provider_model_slug: "claude-opus-4-8-fast",
				endpoint: "text.generate",
				capability_status: "deranked_lvl2",
				is_active_gateway: false,
				input_modalities: "text,image",
				output_modalities: "text",
				context_length: 1_000_000,
				max_input_tokens: 1_000_000,
				max_output_tokens: 128_000,
			},
		];
		provider.pricing_rules = [
			{
				id: "venice-std-input",
				model_key: "venice:anthropic/claude-opus-4.8:text.generate",
				pricing_plan: "standard",
				meter: "input_text_tokens",
				unit: "token",
				unit_size: 1000000,
				price_per_unit: 6,
				currency: "USD",
				note: null,
				priority: 100,
				effective_from: "2026-05-29T00:00:00.000Z",
				effective_to: null,
				match: [],
			},
			{
				id: "venice-priority-input",
				model_key: "venice:anthropic/claude-opus-4.8:text.generate",
				pricing_plan: "priority",
				meter: "input_text_tokens",
				unit: "token",
				unit_size: 1000000,
				price_per_unit: 12,
				currency: "USD",
				note: null,
				priority: 100,
				effective_from: "2026-05-29T00:00:00.000Z",
				effective_to: null,
				match: [],
			},
			{
				id: "venice-hidden-fast-std-input",
				model_key: "venice:anthropic/claude-opus-4.8-fast:text.generate",
				pricing_plan: "standard",
				meter: "input_text_tokens",
				unit: "token",
				unit_size: 1000000,
				price_per_unit: 12,
				currency: "USD",
				note: null,
				priority: 100,
				effective_from: "2026-05-29T00:00:00.000Z",
				effective_to: null,
				match: [],
			},
		];

		const standardSections = buildProviderSections(provider, "standard");
		const prioritySections = buildProviderSections(provider, "priority");

		expect(standardSections.textTokens?.in?.[0]).toMatchObject({
			per1M: 6,
		});
		expect(prioritySections.textTokens?.in?.[0]).toMatchObject({
			per1M: 12,
			basePer1M: 6,
		});
	});

	test("presents a higher-priority promotional rate as a discount without an end date", () => {
		const provider = makeProviderPricing();
		provider.pricing_rules = [
			{
				id: "inkling-input-list",
				model_key: "thinking-machines:thinking-machines/inkling-64k:text.generate",
				pricing_plan: "standard",
				meter: "input_text_tokens",
				unit: "token",
				unit_size: 1_000_000,
				price_per_unit: 3.74,
				currency: "USD",
				note: "Undiscounted list price",
				priority: 100,
				effective_from: "2026-07-15T00:00:00.000Z",
				effective_to: null,
				match: [],
			},
			{
				id: "inkling-input-promotion",
				model_key: "thinking-machines:thinking-machines/inkling-64k:text.generate",
				pricing_plan: "standard",
				meter: "input_text_tokens",
				unit: "token",
				unit_size: 1_000_000,
				price_per_unit: 1.87,
				currency: "USD",
				note: "Limited-time 50% promotion",
				priority: 200,
				effective_from: "2026-07-15T00:00:00.000Z",
				effective_to: null,
				match: [],
			},
		];

		const sections = buildProviderSections(provider, "standard");

		expect(sections.textTokens?.in).toEqual([
			expect.objectContaining({
				per1M: 1.87,
				basePer1M: 3.74,
				comparisonKind: "discount",
				comparisonDirection: "cheaper",
				discountEndsAt: null,
			}),
		]);
	});

	test("labels split Anthropic cache write TTL pricing clearly", () => {
		const provider = makeProviderPricing();
		provider.provider.api_provider_id = "anthropic";
		provider.provider.api_provider_name = "Anthropic";
		provider.pricing_rules = [
			{
				id: "anthropic-cache-write-5m",
				model_key: "openai:openai/gpt-5.5:responses",
				pricing_plan: "standard",
				meter: "cached_write_text_tokens_5m",
				unit: "token",
				unit_size: 1000000,
				price_per_unit: 3.75,
				currency: "USD",
				note: null,
				priority: 100,
				effective_from: "2026-01-01T00:00:00.000Z",
				effective_to: null,
				match: [],
			},
			{
				id: "anthropic-cache-write-1h",
				model_key: "openai:openai/gpt-5.5:responses",
				pricing_plan: "standard",
				meter: "cached_write_text_tokens_1h",
				unit: "token",
				unit_size: 1000000,
				price_per_unit: 6,
				currency: "USD",
				note: null,
				priority: 100,
				effective_from: "2026-01-01T00:00:00.000Z",
				effective_to: null,
				match: [],
			},
		];

		const sections = buildProviderSections(provider, "standard");

		expect(sections.textTokens?.write).toEqual([
			expect.objectContaining({ per1M: 3.75, label: "5 min TTL" }),
			expect.objectContaining({ per1M: 6, label: "1 hour TTL" }),
		]);
	});
});
