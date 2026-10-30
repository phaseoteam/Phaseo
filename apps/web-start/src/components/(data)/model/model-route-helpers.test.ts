import {
	getModelIdFromParams,
	getModelPath,
	isModelAliasRoute,
} from "./model-route-helpers";

describe("model detail routes", () => {
	it("round-trips encoded nested model slugs from direct navigation", () => {
		const modelId = getModelIdFromParams({
			organisationId: "openrouter",
			modelId: "meta-llama%2Fllama-3.1-8b%3Afree",
		});

		expect(modelId).toBe("openrouter/meta-llama/llama-3.1-8b:free");
		expect(getModelPath(modelId)).toBe(
			"/models/openrouter/meta-llama%2Fllama-3.1-8b%3Afree",
		);
	});

	it("preserves a resolved alias route for identifier context", () => {
		expect(isModelAliasRoute({
			requestedModelId: "openai/gpt-astra-latest",
			canonicalModelId: "openai/gpt-6-astra",
			source: "alias",
		})).toBe(true);
		expect(isModelAliasRoute({
			requestedModelId: "openai/gpt-6-astra-2026-09-03",
			canonicalModelId: "openai/gpt-6-astra",
			source: "provider_mapping",
		})).toBe(false);
	});
});
