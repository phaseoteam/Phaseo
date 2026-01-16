import React from "react";
import { Card } from "@/components/ui/card";
import getModelPricing, {
	type ProviderPricing,
} from "@/lib/fetchers/models/getModelPricing";
import getModelOverviewHeader from "@/lib/fetchers/models/getModelOverviewHeader";
import ModelPricingClient from "@/components/(data)/model/pricing/ModelPricingClient";
import { withUTM } from "@/lib/utm";

export default async function ModelPricing({ modelId }: { modelId: string }) {
	const [providers, header] = await Promise.all([
		getModelPricing(modelId),
		getModelOverviewHeader(modelId),
	]);

	// Only consider providers that actually have pricing rules
	const providersWithRules = (providers || []).filter(
		(p) => Array.isArray(p.pricing_rules) && p.pricing_rules.length > 0
	);

	// console.log(
	// 	"Providers with rules:",
	// 	providersWithRules.map((p) => ({
	// 		name: p.provider.api_provider_name,
	// 		plans: p.pricing_rules.map((r) => r.pricing_plan || "standard"),
	// 	}))
	// );

	if (!providersWithRules.length) {
		return (
			<Card className="p-6">
				<h2 className="text-xl font-semibold mb-2">Pricing</h2>
				<p className="text-sm text-muted-foreground">
					No pricing information available for this model yet.
				</p>
				<p className="text-sm text-muted-foreground mt-2">
					If you know providers we can integrate, please tell us on
					Discord or open an issue on GitHub so we can add pricing
					data.
					{/* Link to repository issues */}
					<a
						className="text-primary underline ml-1"
						href={withUTM(
							"https://github.com/AI-Stats/AI-Stats/issues",
							{
								campaign: "model-pricing-feedback",
								content: "model-pricing-component",
							}
						)}
						target="_blank"
						rel="noopener noreferrer"
					>
						Open an issue
					</a>
				</p>
			</Card>
		);
	}

	return (
		<ModelPricingClient
			providers={providersWithRules}
			creatorOrgId={header?.organisation_id ?? null}
		/>
	);
}
