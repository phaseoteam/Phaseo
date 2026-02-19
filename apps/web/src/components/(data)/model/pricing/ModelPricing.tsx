import React from "react";
import { Card } from "@/components/ui/card";
import getModelPricing from "@/lib/fetchers/models/getModelPricing";
import getModelOverviewHeader from "@/lib/fetchers/models/getModelOverviewHeader";
import { getModelProviderRuntimeStatsCached } from "@/lib/fetchers/models/getModelProviderRuntimeStats";
import { getModelSubscriptionPlansCached } from "@/lib/fetchers/models/getModelSubscriptionPlans";
import { getModelProviderRoutingHealthCached } from "@/lib/fetchers/models/getModelProviderRoutingHealth";
import ModelPricingClient from "@/components/(data)/model/pricing/ModelPricingClient";
import { withUTM } from "@/lib/utm";

export default async function ModelPricing({
	modelId,
	includeHidden,
}: {
	modelId: string;
	includeHidden: boolean;
}) {
	const [providers, header, subscriptionPlans] = await Promise.all([
		getModelPricing(modelId, includeHidden),
		getModelOverviewHeader(modelId, includeHidden),
		getModelSubscriptionPlansCached(modelId, includeHidden).catch((error) => {
			console.warn("[pricing] failed to fetch subscription plans; continuing without plans", {
				modelId,
				error,
			});
			return [];
		}),
	]);

	// Only consider providers that actually have pricing rules
	const providersWithRules = (providers || []).filter(
		(p) => Array.isArray(p.pricing_rules) && p.pricing_rules.length > 0
	);

	const runtimeStats = await getModelProviderRuntimeStatsCached({
		modelId,
		providerIds: providersWithRules.map((p) => p.provider.api_provider_id),
		modelAliases: providersWithRules.flatMap((p) =>
			p.provider_models.map((pm) => pm.model_id)
		),
	});
	const routingHealth = await getModelProviderRoutingHealthCached({
		providerIds: providersWithRules.map((p) => p.provider.api_provider_id),
		windowHours: 24,
	});

	// console.log(
	// 	"Providers with rules:",
	// 	providersWithRules.map((p) => ({
	// 		name: p.provider.api_provider_name,
	// 		plans: p.pricing_rules.map((r) => r.pricing_plan || "standard"),
	// 	}))
	// );

	if (!providersWithRules.length && !subscriptionPlans.length) {
		return (
			<Card className="p-6">
				<h2 className="text-xl font-semibold mb-2">
					Availability + Pricing
				</h2>
				<p className="text-sm text-muted-foreground">
					No API pricing or subscription plan information is available
					for this model yet.
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
			subscriptionPlans={subscriptionPlans}
			creatorOrgId={header?.organisation_id ?? null}
			runtimeStats={runtimeStats}
			routingHealth={routingHealth}
		/>
	);
}
