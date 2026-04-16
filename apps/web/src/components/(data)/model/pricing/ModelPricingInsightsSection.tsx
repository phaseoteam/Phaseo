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
import { getModelPricingHistoryRules } from "@/lib/fetchers/models/getModelPricingHistoryRules";
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
			providerIds: providersForDisplay.map((p) => p.provider.api_provider_id),
			modelAliases: providersForDisplay.flatMap((p) =>
				p.provider_models.flatMap((pm) => [pm.model_id, pm.provider_model_slug ?? ""]),
			),
		}),
		getModelPricingHistoryRules({
			modelId,
			providers: providersForDisplay,
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
