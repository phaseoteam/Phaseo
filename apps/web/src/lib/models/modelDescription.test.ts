import {
	buildGeneratedModelDescription,
	buildModelPageMetadataDescription,
	buildModelOverviewMetadataDescription,
	buildModelOverviewMetadataTitle,
	countModelMetadataProviders,
	getExplicitModelDescription,
	markdownToPlainText,
	resolveModelDescription,
} from "./modelDescription";

describe("modelDescription", () => {
	it("counts distinct providers rather than model routes and capabilities", () => {
		const providers = Array.from({ length: 77 }, (_, index) => ({
			api_provider_id: `provider-${index % 22}`,
		}));
		const activeProviders = Array.from({ length: 11 }, (_, index) => ({
			api_provider_id: `provider-${index % 5}`,
		}));
		const providerCount = countModelMetadataProviders(providers);
		expect(providerCount).toBe(22);
		expect(countModelMetadataProviders(activeProviders)).toBe(5);
		expect(buildModelOverviewMetadataTitle("GPT 5.6 Luna", { providerCount, hasPricing: true }))
			.toBe("GPT 5.6 Luna API Pricing — Compare 22 Providers | Phaseo");
		expect(buildModelOverviewMetadataDescription({ modelName: "GPT 5.6 Luna", providerCount, hasPricing: true }))
			.toContain("22 providers");
	});

	it("ignores empty provider identifiers and missing metadata", () => {
		expect(countModelMetadataProviders()).toBe(0);
		expect(countModelMetadataProviders([
			{ api_provider_id: "" }, { api_provider_id: " " },
			{ api_provider_id: "openai" }, { api_provider_id: " openai " },
			{ api_provider_id: "openai-eu" },
		])).toBe(2);
	});

	it("prefers an explicit description from model details", () => {
		const description = getExplicitModelDescription({
			model_details: [
				{ detail_name: "description", detail_value: "  Strong coding model for fast edits.  " },
			],
		});

		expect(description).toBe("Strong coding model for fast edits.");
	});

	it("prefers a top-level description before model details", () => {
		const description = getExplicitModelDescription({
			description: " Flagship reasoning model for deep technical work. ",
			model_details: [
				{ detail_name: "description", detail_value: "Older fallback." },
			],
		});

		expect(description).toBe("Flagship reasoning model for deep technical work.");
	});

	it("generates a fallback description when no explicit description exists", () => {
		const description = buildGeneratedModelDescription({
			model_id: "acme/alpha-1",
			name: "Alpha 1",
			organisation_id: "acme",
			organisation: { name: "Acme" },
			input_types: "text,image",
			output_types: "text",
		});

		expect(description).toContain("Alpha 1 is an AI model from Acme.");
		expect(description).toContain("It accepts text and image inputs and produces text outputs.");
		expect(description).not.toContain("compare providers, pricing, benchmarks, routing support, and availability");
	});

	it("resolves to explicit descriptions before generated ones", () => {
		const description = resolveModelDescription({
			model_id: "acme/alpha-1",
			name: "Alpha 1",
			organisation: { name: "Acme" },
			model_details: [
				{ detail_name: "description", detail_value: "Acme's flagship reasoning model." },
			],
		});

		expect(description).toBe("Acme's flagship reasoning model.");
	});

	it("builds bounded metadata descriptions", () => {
		const description = buildModelPageMetadataDescription({
			modelDescription:
				"Alpha 1 is an AI model from Acme with strong text and image reasoning for product, research, and coding workflows.",
			suffix:
				"Track latency, uptime, provider coverage, and request quality signals on Phaseo.",
			fallback: "Fallback description.",
			maxLength: 140,
		});

		expect(description.length).toBeLessThanOrEqual(143);
		expect(description).toContain("Alpha 1");
	});

	it("converts markdown descriptions to plain text for metadata", () => {
		const plainText = markdownToPlainText(
			"Performance on par with [OpenAI o1](/openai/o1), with **open** reasoning tokens.",
		);

		expect(plainText).toBe(
			"Performance on par with OpenAI o1, with open reasoning tokens.",
		);
	});

	it("builds a concise model overview title", () => {
		expect(buildModelOverviewMetadataTitle("Aion 3.0")).toBe(
			"Aion 3.0 Pricing, Benchmarks & Providers",
		);
	});

	it("shortens the title pattern for long model names", () => {
		expect(
			buildModelOverviewMetadataTitle(
				"Nano Banana 2 Lite (Gemini 3.1 Flash Lite Image)",
			),
		).toBe(
			"Nano Banana 2 Lite (Gemini 3.1 Flash Lite Image) Pricing & Providers",
		);
	});

	it("builds a model overview description around search intent", () => {
		const description = buildModelOverviewMetadataDescription({
			modelName: "Aion 3.0",
			organisationName: "Aion Labs",
		});

		expect(description).toContain("Aion 3.0 pricing, providers, benchmark results");
		expect(description).toContain("from Aion Labs on Phaseo");
		expect(description.length).toBeLessThanOrEqual(160);
	});

	it("builds metadata titles from the strongest available page signal", () => {
		expect(
			buildModelOverviewMetadataTitle("MiniMax M3", {
				providerCount: 12,
				hasPricing: true,
			}),
		).toBe("MiniMax M3 API Pricing — Compare 12 Providers | Phaseo");
	});

	it("keeps signal-based titles concise for long model names", () => {
		const title = buildModelOverviewMetadataTitle(
			"Nano Banana 2 Lite (Gemini 3.1 Flash Lite Image)",
			{ providerCount: 12, hasPricing: true },
		);

		expect(title.length).toBeLessThanOrEqual(60);
	});

	it("does not advertise missing metadata in descriptions", () => {
		const description = buildModelOverviewMetadataDescription({
			modelName: "Qwen 3 8B",
			organisationName: "Qwen",
			providerCount: 0,
			benchmarkCount: 0,
			hasPricing: false,
		});

		expect(description).not.toContain("providers");
		expect(description).not.toContain("benchmark results");
	});
});
