import { groupModelRows, type ModelData } from "./modelTableGrouping";

function row(overrides: Partial<ModelData>): ModelData {
	return {
		id: "openai/gpt-test/provider/capability",
		model: "OpenAI: GPT Test",
		modelId: "openai/gpt-test",
		organisationId: "openai",
		provider: {
			id: "openai",
			name: "OpenAI",
			inputPrice: 1,
			outputPrice: 2,
			features: ["tools"],
			executionRegions: ["us"],
		},
		endpoint: "responses",
		gatewayStatus: "active",
		inputModalities: ["text"],
		outputModalities: ["text"],
		context: 128_000,
		maxOutput: 16_000,
		tier: "standard",
		added: "2026-01-01",
		popularityTokensWeek: 100,
		...overrides,
	};
}

describe("groupModelRows", () => {
	it("renders one aggregate per canonical model with deduplicated providers", () => {
		const result = groupModelRows([
			row({}),
			row({
				id: "openai/gpt-test/azure/chat",
				provider: {
					id: "azure",
					name: "Azure",
					inputPrice: 0,
					outputPrice: 3,
					features: ["json"],
					executionRegions: ["eu"],
				},
				endpoint: "chat.completions",
				inputModalities: ["text", "image"],
				context: 256_000,
				popularityTokensWeek: 150,
			}),
			row({ id: "openai/gpt-test/openai/chat", endpoint: "chat.completions" }),
		]);

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			modelId: "openai/gpt-test",
			endpoints: ["responses", "chat.completions"],
			inputModalities: ["text", "image"],
			features: ["tools", "json"],
			executionRegions: ["us", "eu"],
			context: 256_000,
			inputPrices: [0, 1],
			outputPrices: [2, 3],
			popularityTokensWeek: 150,
		});
		expect(result[0]?.providers.map(({ id }) => id)).toEqual(["azure", "openai"]);
	});

	it("keeps models separate and only marks a model retired when every variant is retired", () => {
		const result = groupModelRows([
			row({ retired: "2026-08-01" }),
			row({ id: "openai/gpt-test/azure/responses", retired: undefined }),
			row({ id: "openai/gpt-other", modelId: "openai/gpt-other", model: "OpenAI: GPT Other" }),
		]);

		expect(result).toHaveLength(2);
		expect(result.find(({ modelId }) => modelId === "openai/gpt-test")?.retired).toBeUndefined();
	});
});
