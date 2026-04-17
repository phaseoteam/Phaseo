import { CircleAlert } from "lucide-react";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { getModelPricingCached } from "@/lib/fetchers/models/getModelPricing";
import { getModelProviderRuntimeStatsCached } from "@/lib/fetchers/models/getModelProviderRuntimeStats";
import {
	getModelPricingHistoryRules,
	type ModelPricingHistoryProviderInput,
} from "@/lib/fetchers/models/getModelPricingHistoryRules";
import ModelPricingInsightsClient from "@/components/(data)/model/pricing/ModelPricingInsightsClient";

export default async function ModelPricingInsightsSection({
	modelId,
	includeHidden,
	showPageHeader = false,
}: {
	modelId: string;
	includeHidden: boolean;
	showPageHeader?: boolean;
}) {
	const providers = await getModelPricingCached(modelId, includeHidden);
	const providersForDisplay = (providers || []).filter(
		(provider) =>
			Array.isArray(provider.provider_models) && provider.provider_models.length > 0,
	);
	const providerIds = Array.from(
		new Set(providersForDisplay.map((provider) => provider.provider.api_provider_id)),
	).sort((a, b) => a.localeCompare(b));
	const modelAliases = Array.from(
		new Set(
			providersForDisplay.flatMap((provider) =>
				provider.provider_models.flatMap((providerModel) =>
					[providerModel.model_id, providerModel.provider_model_slug].filter(
						(value): value is string =>
							typeof value === "string" && value.trim().length > 0,
					),
				),
			),
		),
	).sort((a, b) => a.localeCompare(b));
	const providersForHistory: ModelPricingHistoryProviderInput[] = providersForDisplay
		.map((provider) => ({
			providerId: provider.provider.api_provider_id,
			providerName:
				provider.provider.api_provider_name ||
				provider.provider.api_provider_id,
			models: Array.from(
				new Map(
					provider.provider_models.map((providerModel) => {
						const apiProviderId = String(providerModel.api_provider_id ?? "").trim();
						const modelId = String(providerModel.model_id ?? "").trim();
						const endpoint = String(providerModel.endpoint ?? "").trim();
						const key = `${apiProviderId}:${modelId}:${endpoint}`;
						return [
							key,
							{
								apiProviderId,
								modelId,
								endpoint,
							},
						];
					}),
				).values(),
			)
				.filter(
					(model) =>
						Boolean(model.apiProviderId) &&
						Boolean(model.modelId) &&
						Boolean(model.endpoint),
				)
				.sort((a, b) => {
					const providerCompare = a.apiProviderId.localeCompare(b.apiProviderId);
					if (providerCompare !== 0) return providerCompare;
					const modelCompare = a.modelId.localeCompare(b.modelId);
					if (modelCompare !== 0) return modelCompare;
					return a.endpoint.localeCompare(b.endpoint);
				}),
		}))
		.sort((a, b) => a.providerId.localeCompare(b.providerId));

	if (!providersForDisplay.length) {
		return (
			<Empty className="rounded-md border p-6">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<CircleAlert className="size-4" />
					</EmptyMedia>
					<EmptyTitle>No pricing data available yet</EmptyTitle>
					<EmptyDescription>
						No API pricing information is currently available for this model.
					</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<EmptyDescription>
						If you know providers we should integrate, please tell us on Discord
						or open an issue on GitHub so we can add pricing data.
					</EmptyDescription>
				</EmptyContent>
			</Empty>
		);
	}

	const [runtimeStats, pricingHistoryRules] = await Promise.all([
		getModelProviderRuntimeStatsCached({
			modelId,
			providerIds,
			modelAliases,
		}),
		getModelPricingHistoryRules({
			modelId,
			providers: providersForHistory,
			days: 30,
		}).catch((error) => {
			console.warn("[pricing] failed to fetch pricing history rules", {
				modelId,
				error,
			});
			return [];
		}),
	]);

	return (
		<ModelPricingInsightsClient
			providers={providersForDisplay}
			runtimeStats={runtimeStats}
			historyRules={pricingHistoryRules}
			showPageHeader={showPageHeader}
		/>
	);
}
