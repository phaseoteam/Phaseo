import { renderToStaticMarkup } from "react-dom/server";

import type { ModelOverviewPage } from "@/lib/fetchers/models/getModel";
import type { ModelGatewayMetadata } from "@/lib/fetchers/models/getModelGatewayMetadata";
import type { ProviderPricing } from "@/lib/fetchers/models/getModelPricing";
import ModelFaqSection from "./ModelFaqSection";

const pricing: ProviderPricing[] = [
	{
		provider: { api_provider_id: "fast-cloud", api_provider_name: "Fast Cloud" },
		provider_models: [],
		pricing_rules: [
			{
				id: "input",
				model_key: "fast-cloud:acme/alpha-1:chat",
				pricing_plan: "standard",
				meter: "input_text_tokens",
				unit: "token",
				unit_size: 1_000_000,
				price_per_unit: 0.5,
				currency: "USD",
				note: null,
				match: [],
				priority: 100,
				effective_from: "2026-07-01",
				effective_to: null,
			},
			{
				id: "output",
				model_key: "fast-cloud:acme/alpha-1:chat",
				pricing_plan: "standard",
				meter: "output_text_tokens",
				unit: "token",
				unit_size: 1_000_000,
				price_per_unit: 1.5,
				currency: "USD",
				note: null,
				match: [],
				priority: 100,
				effective_from: "2026-07-01",
				effective_to: null,
			},
			{
				id: "video-tokens",
				model_key: "fast-cloud:acme/alpha-1:video",
				pricing_plan: "standard",
				meter: "output_video_tokens",
				unit: "token",
				unit_size: 1_000_000,
				price_per_unit: 2,
				currency: "USD",
				note: null,
				match: [],
				priority: 100,
				effective_from: "2026-07-01",
				effective_to: null,
			},
			{
				id: "image",
				model_key: "fast-cloud:acme/alpha-1:image",
				pricing_plan: "standard",
				meter: "output_image",
				unit: "image",
				unit_size: 1,
				price_per_unit: 0.04,
				currency: "USD",
				note: null,
				match: [],
				priority: 100,
				effective_from: "2026-07-01",
				effective_to: null,
			},
			{
				id: "video-seconds",
				model_key: "fast-cloud:acme/alpha-1:video",
				pricing_plan: "standard",
				meter: "output_video_seconds",
				unit: "second",
				unit_size: 60,
				price_per_unit: 6,
				currency: "USD",
				note: null,
				match: [],
				priority: 100,
				effective_from: "2026-07-01",
				effective_to: null,
			},
		],
	},
];

const model: ModelOverviewPage = {
	model_id: "acme/alpha-1",
	name: "Alpha 1",
	organisation_id: "acme",
	description: "A multimodal model for reasoning across text and images.",
	status: "Available",
	release_date: "2026-07-01",
	input_types: "text,image",
	output_types: "text",
	organisation: { name: "Acme" },
	model_links: [],
	model_details: [
		{ detail_name: "input_context_length", detail_value: 131_072 },
	],
};

const gatewayMetadata = {
	supportedParametersByEndpoint: {
		"chat.completions": [
			{
				param_id: "tools",
				provider_count_supported: 1,
				provider_count_total: 2,
				support_level: "some_providers",
				providers: [],
			},
			{
				param_id: "structured_outputs",
				provider_count_supported: 2,
				provider_count_total: 2,
				support_level: "all_providers",
				providers: [],
			},
			{
				param_id: "native_structured_outputs",
				provider_count_supported: 1,
				provider_count_total: 2,
				support_level: "some_providers",
				providers: [],
			},
		],
	},
} as unknown as ModelGatewayMetadata;

describe("ModelFaqSection", () => {
	it("renders answers backed by the model-page data", () => {
		const html = renderToStaticMarkup(
			<ModelFaqSection
				model={model}
				benchmarkCount={4}
				activeProviderCount={2}
				isGatewayActive
				pricing={pricing}
				gatewayMetadata={gatewayMetadata}
			/>,
		);

		expect(html).toContain("What is Alpha 1?");
		expect(html).toContain("Alpha 1 is A multimodal model for reasoning across text and images.");
		expect(html).toContain("Does Alpha 1 support tool calling?");
		expect(html).toContain("Does Alpha 1 support structured outputs?");
		expect(html).toContain("At least one active provider route for Alpha 1 currently advertises tool calling support");
		expect(html).toContain("At least one active provider route for Alpha 1 currently advertises structured outputs support");
		expect(html).toContain("How much does Alpha 1 cost?");
		expect(html).toContain("What is the context length of Alpha 1?");
		expect(html).toContain("131,072 tokens");
		expect(html).toContain("available through the Phaseo API");
		expect(html).toContain("2 active providers");
		expect(html).toContain('href="/api-providers/fast-cloud"');
		expect(html).toContain("Fast Cloud");
		expect(html).toContain("4 benchmark results");
		expect(html).toContain("Input Text Tokens at $0.50 per 1M tokens");
		expect(html).toContain("Output Text Tokens at $1.50 per 1M tokens");
		expect(html).toContain("Output Image at $0.04 per image");
		expect(html).toContain("Output Video Tokens at $2.00 per 1M tokens");
		expect(html).toContain("lowest base rates currently recorded across providers");
		expect(html).toContain('aria-expanded="false"');
		expect(html).toContain("grid-rows-[0fr]");
		expect(html).toContain('href="#pricing"');
		expect(html).toContain('href="/organisations/acme"');
	});

	it("does not repeat the model name and renders description markdown", () => {
		const html = renderToStaticMarkup(
			<ModelFaqSection
				model={{
					...model,
					description: "**Alpha 1** is a [multimodal model](https://example.com).",
				}}
				benchmarkCount={0}
				activeProviderCount={0}
				isGatewayActive={false}
				pricing={[]}
			/>,
		);

		expect(html).not.toContain("Alpha 1 is Alpha 1 is");
		expect(html).toContain("multimodal model");
		expect(html).toContain('href="https://example.com"');
		expect(html).toContain(
			"Alpha 1 is a multimodal model.",
		);
	});

	it("caps the provider-name summary and reports the remainder", () => {
		const providerNames = [
			"Alpha",
			"Bravo",
			"Charlie",
			"Delta",
			"Echo",
			"Foxtrot",
			"Golf",
			"Hotel",
			"India",
			"Juliett",
		];
		const manyProviders: ProviderPricing[] = providerNames.map((name, index) => ({
			provider: {
				api_provider_id: `provider-${index + 1}`,
				api_provider_name: name,
			},
			provider_models: [],
			pricing_rules: [],
		}));
		const html = renderToStaticMarkup(
			<ModelFaqSection
				model={model}
				benchmarkCount={0}
				activeProviderCount={10}
				isGatewayActive
				pricing={manyProviders}
			/>,
		);

		expect(html).toContain('href="/api-providers/provider-1"');
		expect(html).toContain('href="/api-providers/provider-8"');
		expect(html).toContain("and 2 more");
		expect(html).not.toContain("India");
		expect(html).not.toContain("Juliett");
	});


	it("reports unsupported and unknown capabilities without guessing", () => {
		const unsupported = {
			...gatewayMetadata,
			supportedParametersByEndpoint: { "chat.completions": [
				{ param_id: "tools", provider_count_supported: 0, provider_count_total: 1, support_level: "no_providers", providers: [] },
				{ param_id: "structured_outputs", provider_count_supported: 0, provider_count_total: 1, support_level: "no_providers", providers: [] },
			] },
		} as unknown as ModelGatewayMetadata;
		const unsupportedHtml = renderToStaticMarkup(
			<ModelFaqSection
				model={model}
				benchmarkCount={0}
				activeProviderCount={1}
				isGatewayActive
				pricing={[]}
				gatewayMetadata={unsupported}
			/>,
		);
		expect(unsupportedHtml).toContain(
			"No active provider route for Alpha 1 currently advertises tool calling support",
		);
		expect(unsupportedHtml).toContain(
			"No active provider route for Alpha 1 currently advertises structured outputs support",
		);

		const unknownHtml = renderToStaticMarkup(
			<ModelFaqSection
				model={model}
				benchmarkCount={0}
				activeProviderCount={1}
				isGatewayActive
				pricing={[]}
				gatewayMetadata={null}
			/>,
		);
		expect(unknownHtml).toContain(
			"does not currently have enough active route metadata to confirm whether Alpha 1 supports tool calling",
		);
	});

	it("uses emitted structured-output metadata without claiming native schema enforcement", () => {
		const legacyOnly = {
			...gatewayMetadata,
			supportedParametersByEndpoint: { "chat.completions": gatewayMetadata.supportedParametersByEndpoint["chat.completions"].filter(row => row.param_id !== "native_structured_outputs") },
		} as unknown as ModelGatewayMetadata;
		const html = renderToStaticMarkup(<ModelFaqSection model={model} benchmarkCount={0} activeProviderCount={1} isGatewayActive pricing={[]} gatewayMetadata={legacyOnly} />);

		expect(html).toContain("At least one active provider route for Alpha 1 currently advertises structured outputs support");
	});

	it("does not link to a pricing section for an inactive model", () => {
		const html = renderToStaticMarkup(
			<ModelFaqSection
				model={model}
				benchmarkCount={0}
				activeProviderCount={0}
				isGatewayActive={false}
				pricing={pricing}
			/>,
		);

		expect(html).not.toContain("How much does Alpha 1 cost?");
		expect(html).not.toContain('href="#pricing"');
		expect(html).not.toContain('href="#benchmarks"');
	});

	it("omits provider FAQ content when the provider section is hidden", () => {
		const html = renderToStaticMarkup(
			<ModelFaqSection
				model={model}
				benchmarkCount={0}
				activeProviderCount={0}
				isGatewayActive={false}
				pricing={[]}
				showProviders={false}
			/>,
		);

		expect(html).not.toContain("What providers serve Alpha 1, and can I use it via API?");
		expect(html).not.toContain('href="#providers"');
	});

	it("explains previous, next, and family relationships", () => {
		const html = renderToStaticMarkup(
			<ModelFaqSection
				model={{ ...model, family_id: "acme/alpha" }}
				benchmarkCount={0}
				activeProviderCount={1}
				isGatewayActive
				pricing={[]}
				relatedModels={{
					previous: { modelId: "acme/alpha-0", modelName: "Alpha 0" },
					next: { modelId: "acme/alpha-2", modelName: "Alpha 2" },
				}}
			/>,
		);

		expect(html).toContain("What models are related to Alpha 1?");
		expect(html).toContain("Alpha 0");
		expect(html).toContain("Alpha 2");
		expect(html).toContain('href="/families/acme/alpha"');
	});

	it("omits the pricing question when no concrete rates are recorded", () => {
		const html = renderToStaticMarkup(
			<ModelFaqSection
				model={model}
				benchmarkCount={0}
				activeProviderCount={1}
				isGatewayActive
				pricing={[]}
			/>,
		);

		expect(html).not.toContain("How much does Alpha 1 cost?");
	});

	it("uses the SKU billing unit for video-seconds pricing", () => {
		const videoSecondsPricing: ProviderPricing[] = [
			{
				...pricing[0]!,
				pricing_rules: pricing[0]!.pricing_rules.filter(
					(rule) => rule.meter === "output_video_seconds",
				),
			},
		];
		const html = renderToStaticMarkup(
			<ModelFaqSection
				model={model}
				benchmarkCount={0}
				activeProviderCount={1}
				isGatewayActive
				pricing={videoSecondsPricing}
			/>,
		);

		expect(html).toContain("Output Video Seconds at $0.10 per second");
	});

	it("falls back to USD when a pricing currency code is malformed", () => {
		const malformedCurrencyPricing: ProviderPricing[] = [
			{
				...pricing[0]!,
				pricing_rules: [
					{
						...pricing[0]!.pricing_rules[0]!,
						currency: "not-a-currency",
					},
				],
			},
		];
		const html = renderToStaticMarkup(
			<ModelFaqSection
				model={model}
				benchmarkCount={0}
				activeProviderCount={1}
				isGatewayActive
				pricing={malformedCurrencyPricing}
			/>,
		);

		expect(html).toContain("$0.50 per 1M tokens");
	});
});
