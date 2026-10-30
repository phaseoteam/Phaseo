import {
	comparePricingEndpoints,
	createModelSelectionId,
	sameStringArray,
	sanitizeMeterInputs,
	sanitizeModelConfigs,
	sanitizeModelSelections,
	sanitizePricingTime,
	sanitizeRequestMultiplier,
} from "./calculatorState";

describe("pricing calculator URL state", () => {
	test.each([
		[Number.NaN, 1],
		[Number.POSITIVE_INFINITY, 1],
		[-5, 1],
		[0, 1],
		[1.9, 1],
		[25, 25],
	])("sanitizes request multiplier %p to %p", (value, expected) => {
		expect(sanitizeRequestMultiplier(value)).toBe(expected);
	});

	test("accepts only valid UTC times", () => {
		expect(sanitizePricingTime("09:45")).toBe("09:45");
		expect(sanitizePricingTime("24:00")).toBe("");
		expect(sanitizePricingTime("not-a-time")).toBe("");
	});

	test("drops malformed and negative meter inputs", () => {
		expect(
			sanitizeMeterInputs({ input_tokens: "1000", output_tokens: "-2", invalid: {} })
		).toEqual({ input_tokens: "1000" });
	});

	test("keeps only complete model configurations", () => {
		expect(
			sanitizeModelConfigs({
				"openai/gpt": {
					endpoint: "responses",
					provider: "openai",
					pricingPlan: "standard",
				},
				broken: { endpoint: "responses" },
			})
		).toEqual({
			"openai/gpt": {
				endpoint: "responses",
				provider: "openai",
				pricingPlan: "standard",
			},
		});
	});

	test("compares model selections in order", () => {
		expect(sameStringArray(["a", "b"], ["a", "b"])).toBe(true);
		expect(sameStringArray(["a", "b"], ["b", "a"])).toBe(false);
	});

	test("keeps duplicate models as independently addressable selections", () => {
		const selections = [{ id: "openai/gpt", modelId: "openai/gpt" }];
		expect(createModelSelectionId("openai/gpt", selections)).toBe("openai/gpt::2");
		expect(sanitizeModelSelections([
			...selections,
			{ id: "openai/gpt::2", modelId: "openai/gpt" },
			{ id: "openai/gpt::2", modelId: "duplicate-is-dropped" },
		])).toEqual([
			{ id: "openai/gpt", modelId: "openai/gpt" },
			{ id: "openai/gpt::2", modelId: "openai/gpt" },
		]);
	});

	test("prefers synchronous generation endpoints over batch endpoints", () => {
		expect(["batch", "text.generate", "responses"].sort(comparePricingEndpoints)).toEqual([
			"responses",
			"text.generate",
			"batch",
		]);
	});
});
