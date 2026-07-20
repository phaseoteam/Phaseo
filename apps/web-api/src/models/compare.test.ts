import { describe, expect, it } from "vitest";
import { composeComparisonModels } from "@/models/compare";

describe("composeComparisonModels", () => {
	it("builds the final compare shape from batched database sources", () => {
		const models = composeComparisonModels(["openai/gpt-test"], {
			models: [{
				model_id: "openai/gpt-test",
				name: "GPT Test",
				organisation_id: "openai",
				description: "Direct description",
				status: "active",
				input_types: ["text"],
				output_types: ["text"],
				organisation: { organisation_id: "openai", name: "OpenAI", country_code: "US" },
				model_details: [
					{ detail_name: "input_context_length", detail_value: "128000" },
					{ detail_name: "reasoning", detail_value: "true" },
				],
				model_links: [{ kind: "documentation", url: "https://example.com/docs" }],
				benchmark_results: [{
					id: 1,
					benchmark_id: "mmlu",
					score: 92,
					is_self_reported: false,
					benchmark: { id: "mmlu", name: "MMLU", category: "knowledge", ascending_order: true, type: "percentage" },
				}],
			}],
			providerRows: [{
				provider_api_model_id: "provider-row",
				provider_id: "openai",
				api_model_id: "openai/gpt-test",
				model_id: "openai/gpt-test",
				is_active_gateway: true,
				data_api_providers: { api_provider_name: "OpenAI", link: "https://openai.com" },
				data_api_provider_model_capabilities: [{ capability_id: "text.generate", status: "active" }],
			}],
			pricingRows: [{
				rule_id: "rule-input",
				model_key: "openai:openai/gpt-test:text.generate",
				pricing_plan: "standard",
				meter: "input_text_tokens",
				unit: "token",
				unit_size: 1_000_000,
				price_per_unit: 2.5,
				currency: "USD",
			}],
			modelPlans: [{ model_id: "openai/gpt-test", plan_uuid: "plan-uuid", model_info: "included" }],
			plans: [{
				plan_uuid: "plan-uuid",
				plan_id: "pro",
				name: "Pro",
				organisation_id: "openai",
				price: 20,
				currency: "USD",
				frequency: "monthly",
				organisation: { organisation_id: "openai", name: "OpenAI", colour: "#fff" },
			}],
		});

		expect(models).toHaveLength(1);
		expect(models[0]).toMatchObject({
			id: "openai/gpt-test",
			description: "Direct description",
			input_context_length: 128000,
			reasoning: true,
			api_reference_link: "https://example.com/docs",
			provider: { provider_id: "openai", name: "OpenAI", country_code: "US" },
			benchmark_results: [{ benchmark_id: "mmlu", benchmark: { order: "higher", type: "percentage" } }],
			prices: [{ api_provider_id: "openai", input_token_price: 2.5, meter: "input_text_tokens" }],
			subscription_plans: [{ plan_id: "pro", prices: [{ price: 20, frequency: "monthly" }] }],
		});
		expect(models[0].compare_provider_pricing).toHaveLength(1);
	});
});
