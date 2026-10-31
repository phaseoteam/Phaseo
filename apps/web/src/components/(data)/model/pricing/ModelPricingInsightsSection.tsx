import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useQueryClient, useSuspenseQueries } from "@tanstack/react-query";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import ModelPricingInsightsClient from "@/components/(data)/model/pricing/ModelPricingInsightsClient";
import ModelPendingApiReleaseBanner from "@/components/(data)/model/overview/ModelPendingApiReleaseBanner";
import {
	modelPendingApiReleaseSectionQuery,
	modelPricingInsightsProvidersQuery,
} from "@/components/(data)/model/modelData.queries";

export default function ModelPricingInsightsSection({
	modelId,
	includeHidden,
	showPageHeader = false,
	hasSubmittedProviderPrices = false,
}: {
	modelId: string;
	includeHidden: boolean;
	showPageHeader?: boolean;
	hasSubmittedProviderPrices?: boolean;
}) {
	const queryClient = useQueryClient();
	const [{ data: providers }, { data: pendingApiRelease }] = useSuspenseQueries({
		queries: [
			modelPricingInsightsProvidersQuery(queryClient, modelId, includeHidden),
			modelPendingApiReleaseSectionQuery(modelId, includeHidden),
		],
	});
	const providersForDisplay = providers || [];
	const tEmpty = useTranslations("Catalogue.modelDetail.emptyStates");
	const providerIds = Array.from(
		new Set(providersForDisplay.map((provider) => provider.provider.api_provider_id)),
	).sort((a, b) => a.localeCompare(b));
	if (!providersForDisplay.length) {
		const isPreview = pendingApiRelease?.isPendingApiRelease === true || hasSubmittedProviderPrices;
		return (
			<div className="space-y-3">
				{pendingApiRelease?.isPendingApiRelease ? (
					<ModelPendingApiReleaseBanner
						modelName={pendingApiRelease.modelName}
						surface="pricing"
					/>
				) : null}
				<Empty className="rounded-md border p-6">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<CircleAlert className="size-4" />
						</EmptyMedia>
						<EmptyTitle>{isPreview ? tEmpty("noHistoryTitle") : tEmpty("noPricingTitle")}</EmptyTitle>
						<EmptyDescription>
							{isPreview
								? tEmpty("submittedPrices")
								: tEmpty("noPricingDescription")}
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						{!isPreview ? (
							<EmptyDescription>
								{tEmpty("suggestProviders")}
							</EmptyDescription>
						) : null}
					</EmptyContent>
				</Empty>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{pendingApiRelease?.isPendingApiRelease ? (
				<ModelPendingApiReleaseBanner
					modelName={pendingApiRelease.modelName}
					surface="pricing"
				/>
			) : null}
			<ModelPricingInsightsClient
				modelId={modelId}
				providers={providersForDisplay}
				providerIds={providerIds}
				includeHidden={includeHidden}
				showPageHeader={showPageHeader}
			/>
		</div>
	);
}
