import { describe, expect, it } from "vitest";
import { withDecisionOperationPricing } from "./decision-pricing";
import type { ModelPricingSource } from "./pricing";

const model = { model_id: "openai/gpt-6-luna", lowest_input_price: 0.1, lowest_output_price: 0 };
function source(): ModelPricingSource {
	return {
		providerRows: [{ model_id: model.model_id, provider_id: "openai", provider_api_model_id: "luna-route", is_active_gateway: true, access_scope: "public",
			data_api_providers: { routing_status: "active", status: "active" },
			data_api_provider_model_capabilities: [{ capability_id: "text.generate", status: "active" }, { capability_id: "decisions.make", status: "active" }] }],
		pricingRows: [
			["text.generate", "input_tokens", 1], ["text.generate", "output_tokens", 2],
			["decisions.make", "input_tokens", 0.1], ["decisions.make", "output_tokens", 0],
		].map(([capability, meter, price]) => ({ model_key: `openai:${model.model_id}:${capability}`, provider_model_id: "luna-route",
			capability_id: capability, meter, price_per_unit: price, unit: "token", unit_size: 1_000_000,
			pricing_plan: "standard", sku_status: "active", currency: "USD" })),
	};
}
describe("Decisions model operation pricing", () => {
	it("keeps chat summary prices and zero-priced Decisions output separate", () => {
		const result = withDecisionOperationPricing([model], source())[0];
		expect(result.lowest_input_price).toBe(1);
		expect(result.lowest_output_price).toBe(2);
		expect(result.operation_pricing).toEqual([
			{ capability: "text.generate", input: 1, output: 2 },
			{ capability: "decisions.make", input: 0.1, output: 0 },
		]);
	});
	it.each(["draft", "disabled"])("does not present %s prices as available", status => {
		const data = source();
		data.pricingRows.forEach(rule => { rule.sku_status = status; });
		expect(withDecisionOperationPricing([model], data)[0].lowest_input_price).toBeNull();
	});
	it("excludes private routes and unknown prices instead of displaying them as free", () => {
		const data = source();
		data.providerRows[0].access_scope = "private";
		expect(withDecisionOperationPricing([model], data)[0].operation_pricing).toEqual([]);
	});
	it("excludes disabled providers even if their route still says active", () => {
		const data = source();
		data.providerRows[0].data_api_providers = { routing_status: "disabled", status: "active" };
		expect(withDecisionOperationPricing([model], data)[0].operation_pricing).toEqual([]);
	});
	it("excludes prices from a route whose capability is disabled", () => {
		const data = source();
		data.providerRows.push({ ...data.providerRows[0], provider_api_model_id: "disabled-route",
			data_api_provider_model_capabilities: [{ capability_id: "text.generate", status: "disabled" }] });
		data.pricingRows.push({ ...data.pricingRows[0], provider_model_id: "disabled-route", price_per_unit: 0 });
		expect(withDecisionOperationPricing([model], data)[0].lowest_input_price).toBe(1);
	});
	it("ignores expired rules, cache meters, and future rules", () => {
		const data = source();
		data.pricingRows[0].effective_to = "2025-01-01";
		data.pricingRows.push({ ...data.pricingRows[1], meter: "cached_read_text_tokens", price_per_unit: 0 });
		data.pricingRows[1].effective_from = "2099-01-01";
		expect(withDecisionOperationPricing([model], data)[0].lowest_input_price).toBeNull();
		expect(withDecisionOperationPricing([model], data)[0].lowest_output_price).toBeNull();
	});
});
