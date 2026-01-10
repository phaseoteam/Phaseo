import { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import PricingCalculator from "@/components/(tools)/PricingCalculator";
import { getPricingModelsCached } from "@/lib/fetchers/pricing/getPricingModels";

export const metadata: Metadata = buildMetadata({
    title: "Pricing Calculator - AI Model Cost Estimator",
    description:
        "Calculate costs for AI model usage across different providers. Enter token counts and get accurate pricing estimates.",
    path: "/tools/pricing-calculator",
    keywords: ["AI pricing", "cost calculator", "model pricing", "token costs", "AI Stats"],
});

export default async function PricingCalculatorPage() {
    const models = await getPricingModelsCached();
    return <PricingCalculator initialModels={models} />;
}