import React from "react";
import { Card } from "@/components/ui/card";
import { CircleAlert } from "lucide-react";
import { getModelPricingCached } from "@/lib/fetchers/models/getModelPricing";
import getModelOverviewHeader from "@/lib/fetchers/models/getModelOverviewHeader";
import { getModelProviderRuntimeStatsCached } from "@/lib/fetchers/models/getModelProviderRuntimeStats";
import { getModelSubscriptionPlansCached } from "@/lib/fetchers/models/getModelSubscriptionPlans";
import { getModelProviderRoutingHealthCached } from "@/lib/fetchers/models/getModelProviderRoutingHealth";
import ModelPricingClient from "@/components/(data)/model/pricing/ModelPricingClient";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";

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
		getModelPricingCached(modelId, includeHidden),
		getModelOverviewHeader(modelId, includeHidden),
		getModelSubscriptionPlansCached(modelId, includeHidden).catch((error) => {
			console.warn("[pricing] failed to fetch subscription plans; continuing without plans", {
				modelId,
				error,
			});
			return [];
		}),
	]);

	// Keep pricing/detail pages aligned with `/models`: only show providers once
	// the capability rows for this model have actually been imported.
	const providersForDisplay = (providers || []).filter(
		(provider) =>
			Array.isArray(provider.provider_models) &&
			provider.provider_models.some(
				(providerModel) =>
					Boolean(providerModel.endpoint) &&
					providerModel.endpoint !== "unmapped"
			)
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
				<Empty className="rounded-md border p-6">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<CircleAlert className="size-4" />
						</EmptyMedia>
						<EmptyTitle>No pricing data available yet</EmptyTitle>
						<EmptyDescription>
							No API pricing or subscription plan information is available
							for this model yet.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<EmptyDescription>
							If you know providers we can integrate, please tell us on
							Discord or open an issue on GitHub so we can add pricing
							data.
							<a
								className="ml-1 text-primary underline"
								href="https://github.com/AI-Stats/AI-Stats/issues"
								target="_blank"
								rel="noopener noreferrer"
							>
								Open an issue
							</a>
						</EmptyDescription>
					</EmptyContent>
				</Empty>
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
