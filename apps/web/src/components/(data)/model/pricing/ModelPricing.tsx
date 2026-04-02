import React from "react";
import { Card } from "@/components/ui/card";
import getModelPricing from "@/lib/fetchers/models/getModelPricing";
import getModelOverviewHeader from "@/lib/fetchers/models/getModelOverviewHeader";
import { getModelProviderRuntimeStatsCached } from "@/lib/fetchers/models/getModelProviderRuntimeStats";
import { getModelSubscriptionPlansCached } from "@/lib/fetchers/models/getModelSubscriptionPlans";
import { getModelProviderRoutingHealthCached } from "@/lib/fetchers/models/getModelProviderRoutingHealth";
import ModelPricingClient from "@/components/(data)/model/pricing/ModelPricingClient";

export default async function ModelPricing({
	modelId,
	includeHidden,
	showHeader = true,
}: {
	modelId: string;
	includeHidden: boolean;
	showHeader?: boolean;
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

	// Show providers with model mappings even when pricing rules are missing.
	const providersForDisplay = (providers || []).filter(
		(p) => Array.isArray(p.provider_models) && p.provider_models.length > 0
	);

	const runtimeStats = await getModelProviderRuntimeStatsCached({
		modelId,
		providerIds: providersForDisplay.map((p) => p.provider.api_provider_id),
		modelAliases: providersForDisplay.flatMap((p) =>
			p.provider_models.flatMap((pm) => [
				pm.model_id,
				pm.provider_model_slug ?? "",
			])
		),
	});
	const routingHealth = await getModelProviderRoutingHealthCached({
		providerIds: providersForDisplay.map((p) => p.provider.api_provider_id),
		windowHours: 24,
	});

	// console.log(
	// 	"Providers with rules:",
	// 	providersWithRules.map((p) => ({
	// 		name: p.provider.api_provider_name,
	// 		plans: p.pricing_rules.map((r) => r.pricing_plan || "standard"),
	// 	}))
	// );

	if (!providersForDisplay.length && !subscriptionPlans.length) {
		return (
			<Card className="p-6">
				{showHeader ? (
					<h2 className="mb-2 text-xl font-semibold">Availability + Pricing</h2>
				) : null}
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
						href="https://github.com/AI-Stats/AI-Stats/issues"
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
			providers={providersForDisplay}
			subscriptionPlans={subscriptionPlans}
			creatorOrgId={header?.organisation_id ?? null}
			runtimeStats={runtimeStats}
			routingHealth={routingHealth}
			showHeader={showHeader}
		/>
	);
}
