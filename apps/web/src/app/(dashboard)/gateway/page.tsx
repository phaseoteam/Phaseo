import type { Metadata } from "next";

import { getGatewayMarketingMetrics } from "@/lib/fetchers/gateway/getMarketingMetrics";
import { getModelCardsByIdsCached } from "@/lib/fetchers/models/getModelCardsByIds";

import { Hero } from "@/components/landingPage/Gateway/Hero";
import { Features } from "@/components/landingPage/Gateway/Features";
import { Integrations } from "@/components/landingPage/Gateway/Integrations";
import { CompareSection } from "@/components/(gateway)/sections/CompareSection";
import { FAQSection } from "@/components/(gateway)/sections/FAQSection";
import { CTA } from "@/components/landingPage/Gateway/CTA";

export const metadata: Metadata = {
	title: "AI Stats Gateway - Single API for Every Model",
	description:
		"AI Stats Gateway standardises provider quirks behind one surface, with routing, reliability, observability, and security for production workloads.",
	alternates: { canonical: "/gateway" },
	openGraph: {
		type: "website",
		title: "AI Stats Gateway — Single API for Every Model",
		description:
			"Unify 50+ AI providers behind one API. Route intelligently by latency, cost, and availability. Ship production workloads with confidence.",
	},
};

export default async function GatewayMarketingPage() {
	const monthlyWindowHours = 24 * 30;
	const [gatewayMetrics, popularModels] = await Promise.all([
		getGatewayMarketingMetrics(monthlyWindowHours),
		getModelCardsByIdsCached(
			[
				"openai/gpt-5-2-2025-12-11",
				"anthropic/claude-opus-4-5-2025-11-24",
				"google/gemini-3-pro-preview-2025-11-18",
				"minimax/minimax-m2-1-2025-12-23",
			],
			false
		),
	]);

	return (
		<div className="container mx-auto flex flex-col items-center pt-16 sm:pt-20">
			{/* Hero with stats, provider marquee, and popular models */}
		<Hero
			stats={{
				...gatewayMetrics.summary,
			}}
			statsWindowHours={monthlyWindowHours}
			tokensWindowHours={monthlyWindowHours}
			popularModels={popularModels}
		/>

			{/* Features grid showing key capabilities */}
			<Features />

			{/* SDK integrations with code examples */}
			<Integrations />

			{/* Comparison table vs competitors */}
			<CompareSection />

			{/* Frequently asked questions */}
			<FAQSection />

			{/* Final CTA section */}
			<CTA />
		</div>
	);
}
