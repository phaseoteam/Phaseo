import type { ProviderModel } from "@/lib/fetchers/models/getModelPricing";
import { buildParameterSupportSummary } from "./ProviderModelParameters";

function providerModel(
	params: ProviderModel["params"],
	overrides: Partial<ProviderModel> = {},
): ProviderModel {
	return {
		id: "provider-model",
		api_provider_id: "provider",
		model_id: "model",
		endpoint: "chat.completions",
		is_active_gateway: true,
		input_modalities: "text",
		output_modalities: "text",
		params,
		...overrides,
	};
}

describe("buildParameterSupportSummary", () => {
	it("marks missing and empty capability metadata as unknown", () => {
		expect(
			buildParameterSupportSummary([
				providerModel(null),
				providerModel({}, { endpoint: "responses" }),
			]),
		).toEqual({
			parameters: [],
			status: "unknown",
			documentedRouteCount: 0,
			unknownRouteCount: 2,
		});
	});

	it("marks a mixed route selection as partial", () => {
		expect(
			buildParameterSupportSummary([
				providerModel({ temperature: {}, top_p: {} }),
				providerModel(null, { endpoint: "responses" }),
			]),
		).toEqual({
			parameters: ["temperature", "top_p"],
			status: "partial",
			documentedRouteCount: 1,
			unknownRouteCount: 1,
		});
	});

	it("marks fully populated route metadata as documented", () => {
		expect(
			buildParameterSupportSummary([
				providerModel({ properties: { max_tokens: {}, temperature: {} } }),
			]),
		).toEqual({
			parameters: ["max_tokens", "temperature"],
			status: "documented",
			documentedRouteCount: 1,
			unknownRouteCount: 0,
		});
	});
});
