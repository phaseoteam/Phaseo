import { Metadata } from "next";
import { Suspense } from "react";
import { buildMetadata } from "@/lib/seo";
import PricingCalculator from "@/components/(tools)/PricingCalculator";
import { fetchFrontendPricingModels } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import type { PricingModel } from "@/lib/fetchers/pricing/getPricingModels";
import { loadPricingCalculatorSearchParams } from "./search-params";

export const metadata: Metadata = buildMetadata({
	title: "AI Pricing Calculator: Compare LLM API Costs",
	description:
		"Estimate token costs and compare LLM API pricing across major providers using daily pricing data.",
	path: "/tools/pricing-calculator",
	keywords: [
		"AI pricing calculator",
		"LLM pricing calculator",
		"token cost calculator",
		"LLM cost comparison",
		"compare AI model prices",
		"AI API pricing",
		"AI model pricing",
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
	let models: PricingModel[] = [];
	try {
		models = await fetchFrontendPricingModels();
	} catch (error) {
		console.error("[pricing-calculator] failed to load pricing models", error);
	}
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
