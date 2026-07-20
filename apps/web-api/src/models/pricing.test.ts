import { describe, expect, it } from "vitest";
import { composeModelPricing } from "@/models/pricing";

describe("composeModelPricing", () => {
	it("groups provider models and attaches active or upcoming normalized rules", () => {
		const providers = composeModelPricing([
			{
				provider_api_model_id: "pm-1",
				provider_id: "provider-a",
				api_model_id: "openai/gpt-test:free",
				provider_model_slug: "gpt-test",
				is_active_gateway: true,
				input_modalities: ["text"],
				output_modalities: ["text"],
				data_api_provider_model_capabilities: [{ capability_id: "text.generate", status: "active", max_input_tokens: 128000 }],
				data_api_providers: { api_provider_name: "Provider A", country_code: "US" },
			},
		], [
			{ rule_id: "rule-1", model_key: "provider-a:openai/gpt-test:free:text.generate", pricing_plan: "standard", meter: "input_text_tokens", unit: "token", unit_size: 1000000, price_per_unit: 0, currency: "USD", priority: 100, effective_from: "2026-01-01T00:00:00Z", effective_to: null, note: "Free tier", match: [] },
			{ rule_id: "expired", model_key: "provider-a:openai/gpt-test:free:text.generate", pricing_plan: "standard", meter: "output_text_tokens", unit: "token", unit_size: 1000000, price_per_unit: 1, effective_to: "2020-01-01T00:00:00Z" },
		]);

		expect(providers).toHaveLength(1);
		expect(providers[0]?.provider).toMatchObject({ api_provider_id: "provider-a", api_provider_name: "Provider A" });
		expect(providers[0]?.provider_models).toMatchObject([{ endpoint: "text.generate", context_length: null, max_input_tokens: 128000 }]);
		expect(providers[0]?.pricing_rules).toMatchObject([{ id: "rule-1", pricing_plan: "free", price_per_unit: 0 }]);
	});
});
