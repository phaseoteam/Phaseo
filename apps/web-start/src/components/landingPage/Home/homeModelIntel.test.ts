import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import {
	BETA_OPEN_MODEL_INTEL,
	buildHomeModelPrices,
} from "./homeModelIntel";

function route(
	values: Partial<GatewaySupportedModel> & Pick<GatewaySupportedModel, "modelId">,
): GatewaySupportedModel {
	return {
		isAvailable: true,
		inputPricePerMillion: null,
		outputPricePerMillion: null,
		...values,
	} as GatewaySupportedModel;
}

describe("buildHomeModelPrices", () => {
	it("selects the lowest complete price from available gateway routes", () => {
		const prices = buildHomeModelPrices([
			route({
				modelId: "openai/gpt-6-astra",
				providerId: "atlascloud",
				inputPricePerMillion: 5,
				outputPricePerMillion: 30,
			}),
			route({
				modelId: "openai/gpt-6-astra",
				providerId: "openai",
				inputPricePerMillion: 4,
				outputPricePerMillion: 20,
			}),
			route({
				modelId: "openai/gpt-6-astra",
				providerId: "discovery-only",
				isAvailable: false,
				inputPricePerMillion: 3.6,
				outputPricePerMillion: 18,
			}),
		]);

		expect(prices["openai/gpt-6-astra"]).toEqual({
			inputPrice: 4,
			outputPrice: 20,
		});
	});

	it("prefers the lower output price when input prices tie", () => {
		const prices = buildHomeModelPrices([
			route({
				modelId: "google/gemini-3.8-flash",
				inputPricePerMillion: 2,
				outputPricePerMillion: 18,
			}),
			route({
				modelId: "google/gemini-3.8-flash",
				inputPricePerMillion: 2,
				outputPricePerMillion: 12,
			}),
		]);

		expect(prices["google/gemini-3.8-flash"]).toEqual({
			inputPrice: 2,
			outputPrice: 12,
		});
	});

	it("ignores incomplete prices and models outside the homepage set", () => {
		const prices = buildHomeModelPrices([
			route({
				modelId: "minimax/minimax-m3",
				inputPricePerMillion: 0.23,
			}),
			route({
				modelId: "other/model",
				inputPricePerMillion: 0.1,
				outputPricePerMillion: 0.2,
			}),
		]);

		expect(prices).toEqual({});
	});
});

describe("BETA_OPEN_MODEL_INTEL", () => {
	it("keeps distinct metrics for each animated model card", () => {
		const metricPairs = BETA_OPEN_MODEL_INTEL.map(
			({ latencyMs, throughputTps }) => `${latencyMs}:${throughputTps}`,
		);

		expect(new Set(metricPairs).size).toBe(BETA_OPEN_MODEL_INTEL.length);
	});
});
