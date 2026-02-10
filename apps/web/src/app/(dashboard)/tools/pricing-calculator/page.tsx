import { Metadata } from "next";
import { Suspense } from "react";
import { buildMetadata } from "@/lib/seo";
import PricingCalculator from "@/components/(tools)/PricingCalculator";
import { getPricingModelsCached } from "@/lib/fetchers/pricing/getPricingModels";
import { loadPricingCalculatorSearchParams } from "./search-params";
import { resolveIncludeHidden } from "@/lib/fetchers/models/visibility";

export const metadata: Metadata = buildMetadata({
	title: "AI Pricing Calculator 2026 - Compare 500+ Models | OpenAI, Anthropic, Google, Meta",
	description:
		"Free AI pricing calculator for 500+ models. Compare costs for GPT-5, Claude 4.5, Gemini 3, DeepSeek & more. Calculate token costs, API pricing, and budget estimates across OpenAI, Anthropic, Google, AWS, Azure. Real-time pricing data updated daily.",
	path: "/tools/pricing-calculator",
	keywords: [
		// Primary keywords
		"AI pricing calculator",
		"AI model pricing",
		"AI cost calculator",
		"LLM pricing calculator",

		// Provider-specific
		"OpenAI pricing calculator",
		"ChatGPT API pricing",
		"GPT-5 pricing calculator",
		"Claude pricing calculator",
		"Anthropic pricing",
		"Claude 4.5 Sonnet pricing",
		"Google AI pricing",
		"Gemini pricing calculator",
		"Meta Llama pricing",
		"AWS Bedrock pricing",
		"Azure pricing",
		"Vertex AI pricing",

		// Use case keywords
		"token cost calculator",
		"AI API cost estimator",
		"machine learning pricing",
		"generative AI pricing",
		"AI budget calculator",
		"AI spending calculator",
		"LLM cost comparison",
		"compare AI model prices",

		// Long-tail
		"how much does GPT-5 cost",
		"calculate AI API costs",
		"AI model cost comparison tool",
		"cheapest AI model",
		"AI pricing comparison",
		"enterprise AI pricing",
		"AI cost per token",
		"calculate chatbot costs",

		// Technical
		"input token pricing",
		"output token pricing",
		"cached token pricing",
		"batch API pricing",
		"AI model endpoint pricing",
		"real-time AI pricing",

		// Brand
		"AI Stats pricing tool",
		"AI Stats calculator",
	],
});

export default async function PricingCalculatorPage({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	return (
		<Suspense fallback={<PricingCalculator initialModels={[]} totalModelsCount={0} providersCount={0} />}>
			<PricingCalculatorPageContent searchParams={searchParams} />
		</Suspense>
	);
}

async function PricingCalculatorPageContent({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const includeHidden = await resolveIncludeHidden();
	const models = await getPricingModelsCached(includeHidden);
	const resolvedSearchParams = await searchParams;
	const parsedParams =
		loadPricingCalculatorSearchParams(resolvedSearchParams);

	// Extract model names for structured data
	const modelNames = Array.from(
		new Set(models.map((m) => m.display_name || m.model))
	)
		.sort()
		.slice(0, 100); // Top 100 for structured data

	const providers = Array.from(new Set(models.map((m) => m.provider))).sort();

	return (
		<PricingCalculator
			initialModels={models}
			initialModel={parsedParams.model || undefined}
			initialEndpoint={parsedParams.endpoint || undefined}
			initialProvider={parsedParams.provider || undefined}
			initialPlan={parsedParams.plan || undefined}
			totalModelsCount={modelNames.length}
			providersCount={providers.length}
		/>
	);
}
