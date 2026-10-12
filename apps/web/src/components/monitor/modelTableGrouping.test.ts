import { groupModelRows, lowestDisplayedPrice, type ModelData } from "./modelTableGrouping";

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
	it("keeps one Luna row with both capabilities and separates their pricing", () => {
		const groups = groupModelRows([
			row({ modelId: "openai/gpt-6-luna", endpoint: "text.generate" }),
			row({ modelId: "openai/gpt-6-luna", endpoint: "decisions.make",
				provider: { id: "openai", name: "OpenAI", inputPrice: 0.1, outputPrice: null, features: [] } }),
		]);
		expect(groups).toHaveLength(1);
		expect(groups[0].endpoints).toEqual(["text.generate", "decisions.make"]);
		expect(groups[0].providers).toHaveLength(1);
		expect(groups[0].inputPrices).toEqual([1]);
		expect(groups[0].outputPrices).toEqual([2]);
		expect(groups[0].operationPrices).toEqual([
			{ capability: "text.generate", inputPrices: [1], outputPrices: [2], usagePrices: [] },
			{ capability: "decisions.make", inputPrices: [0.1], outputPrices: [], usagePrices: [] },
		]);
	});
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
			row({
				id: "openai/gpt-test/openai/chat",
				endpoint: "chat.completions",
				gatewayStatus: "disabled",
			}),
		]);

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			modelId: "openai/gpt-test",
			endpoints: ["text.generate"],
			statusEndpoints: [
				{ status: "active", endpoints: ["text.generate"] },
				{ status: "disabled", endpoints: ["text.generate"] },
			],
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

	it("shows a separate image capability under one status icon when it shares the text rate", () => {
		const [group] = groupModelRows([
			row({ endpoint: "image.generate", provider: { id: "google-ai-studio", name: "Google AI Studio", inputPrice: 1.5, outputPrice: 7.5, features: [] } }),
			row({ endpoint: "text.generate", provider: { id: "google-ai-studio", name: "Google AI Studio", inputPrice: 1.5, outputPrice: 7.5, features: [] } }),
		]);
		expect(group.endpoints).toEqual(["text.generate", "image.generate"]);
		expect(group.statusEndpoints).toEqual([{ status: "active", endpoints: ["text.generate", "image.generate"] }]);
		expect(group.inputPrices).toEqual([1.5]);
		expect(group.outputPrices).toEqual([7.5]);
		expect(group.operationPrices).toEqual([]);
	});

	it("collapses endpoint aliases into one capability", () => {
		const [group] = groupModelRows([
			row({ endpoint: "embeddings", gatewayStatus: "disabled" }),
			row({ endpoint: "text.embed" }),
			row({ endpoint: "/v1/images/generations" }),
		]);
		expect(group.endpoints).toEqual(["image.generate", "text.embed"]);
		expect(group.statusEndpoints).toEqual([
			{ status: "disabled", endpoints: ["text.embed"] },
			{ status: "active", endpoints: ["image.generate", "text.embed"] },
		]);
	});

	it("does not let a batch row without a token rate become a $0 price floor", () => {
		const [group] = groupModelRows([
			row({ endpoint: "batch", tier: "batch", provider: { id: "openai", name: "OpenAI", inputPrice: null, outputPrice: null, features: [] } }),
			row({ endpoint: "text.generate", provider: { id: "openai", name: "OpenAI", inputPrice: 2, outputPrice: 10, features: [] } }),
		]);
		expect(group.endpoints).toEqual(["text.generate", "batch"]);
		expect(group.tiers).toEqual(["batch", "standard"]);
		expect(group.inputPrices).toEqual([2]);
		expect(group.outputPrices).toEqual([10]);
		expect(group.operationPrices).toEqual([]);
	});

	it("keeps genuine free-tier and provider price differences", () => {
		const [group] = groupModelRows([
			row({ tier: "free", provider: { id: "openai", name: "OpenAI", inputPrice: 0, outputPrice: 0, features: [] } }),
			row({ provider: { id: "openai", name: "OpenAI", inputPrice: 1, outputPrice: 2, features: [] } }),
			row({ provider: { id: "azure", name: "Azure", inputPrice: 1.1, outputPrice: 2.2, features: [] } }),
		]);
		expect(group.inputPrices).toEqual([0, 1, 1.1]);
		expect(group.outputPrices).toEqual([0, 2, 2.2]);
	});

	it("keeps a listed $0 standard rate", () => {
		const [group] = groupModelRows([
			row({ provider: { id: "openai", name: "OpenAI", inputPrice: 0, outputPrice: 0, features: [] } }),
		]);
		expect(group.inputPrices).toEqual([0]);
		expect(group.outputPrices).toEqual([0]);
	});

	it("shows a per-second video model's charge instead of a $0 token price", () => {
		const video = (providerId: string, usagePrice: number) => row({
			modelId: "alibaba/happyhorse-1.0",
			endpoint: "video.generate",
			provider: { id: providerId, name: providerId, inputPrice: null, outputPrice: null, usagePrice, usageUnit: "second", features: [] },
		});
		const [group] = groupModelRows([video("venice", 0.2), video("alibaba-cloud", 0.14), video("runway", 0.14)]);
		expect(group.inputPrices).toEqual([]);
		expect(group.outputPrices).toEqual([]);
		expect(group.usagePrices).toEqual([{ price: 0.14, unit: "second" }]);
		expect(group.operationPrices).toEqual([]);
	});

	it("states per-pixel and per-character charges per million", () => {
		const [group] = groupModelRows([
			row({ endpoint: "image.generate", provider: { id: "together", name: "Together", inputPrice: null, outputPrice: null, usagePrice: 5.8e-9, usageUnit: "pixel", features: [] } }),
			row({ endpoint: "audio.speech", provider: { id: "deepinfra", name: "DeepInfra", inputPrice: null, outputPrice: null, usagePrice: 6.2e-7, usageUnit: "character", features: [] } }),
		]);
		expect(group.usagePrices.map(({ unit }) => unit)).toEqual(["megapixel", "1M characters"]);
		expect(group.usagePrices[0].price).toBeCloseTo(0.0058);
		expect(group.usagePrices[1].price).toBeCloseTo(0.62);
	});

	it("shows no price for an image model whose routes list none", () => {
		const [group] = groupModelRows([
			row({ endpoint: "image.generate", provider: { id: "openai", name: "OpenAI", inputPrice: null, outputPrice: null, features: [] } }),
		]);
		expect(group.inputPrices).toEqual([]);
		expect(group.outputPrices).toEqual([]);
		expect(group.usagePrices).toEqual([]);
	});

	it("sorts by the cheapest rate shown for any capability", () => {
		const [group] = groupModelRows([
			row({ endpoint: "text.generate", provider: { id: "openai", name: "OpenAI", inputPrice: 10, outputPrice: 30, features: [] } }),
			row({ endpoint: "image.generate", provider: { id: "openai", name: "OpenAI", inputPrice: 1, outputPrice: 8, features: [] } }),
		]);
		expect(group.inputPrices).toEqual([10]);
		expect(lowestDisplayedPrice(group, "inputPrices")).toBe(1);
		expect(lowestDisplayedPrice(group, "outputPrices")).toBe(8);
		const [unpriced] = groupModelRows([
			row({ endpoint: "image.generate", provider: { id: "openai", name: "OpenAI", inputPrice: null, outputPrice: null, features: [] } }),
		]);
		expect(lowestDisplayedPrice(unpriced, "inputPrices")).toBe(Number.POSITIVE_INFINITY);
	});

	it("keeps a per-image charge beside the text token rate", () => {
		const [group] = groupModelRows([
			row({ endpoint: "text.generate", provider: { id: "google", name: "Google", inputPrice: 0.3, outputPrice: 2.5, features: [] } }),
			row({ endpoint: "image.generate", provider: { id: "google", name: "Google", inputPrice: null, outputPrice: null, usagePrice: 0.039, usageUnit: "image", features: [] } }),
		]);
		expect(group.inputPrices).toEqual([0.3]);
		expect(group.outputPrices).toEqual([2.5]);
		expect(group.usagePrices).toEqual([{ price: 0.039, unit: "image" }]);
		expect(group.operationPrices).toEqual([
			{ capability: "text.generate", inputPrices: [0.3], outputPrices: [2.5], usagePrices: [] },
			{ capability: "image.generate", inputPrices: [], outputPrices: [], usagePrices: [{ price: 0.039, unit: "image" }] },
		]);
	});

	it("keeps per-capability prices when capabilities charge different rates", () => {
		const [group] = groupModelRows([
			row({ endpoint: "ocr", provider: { id: "atlascloud", name: "AtlasCloud", inputPrice: 0.05, outputPrice: 0.08, features: [] } }),
			row({ endpoint: "text.generate", provider: { id: "atlascloud", name: "AtlasCloud", inputPrice: 0.04, outputPrice: 0.08, features: [] } }),
		]);
		expect(group.inputPrices).toEqual([0.04]);
		expect(lowestDisplayedPrice(group, "inputPrices")).toBe(0.04);
		expect(group.operationPrices).toEqual([
			{ capability: "text.generate", inputPrices: [0.04], outputPrices: [0.08], usagePrices: [] },
			{ capability: "ocr", inputPrices: [0.05], outputPrices: [0.08], usagePrices: [] },
		]);
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
