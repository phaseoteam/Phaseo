import { CircleAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";
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
	fetchFrontendModelPendingApiReleaseState,
	fetchFrontendModelPricing,
	fetchFrontendModelPricingHistory,
	fetchFrontendModelEffectivePricingDaily,
	fetchFrontendModelUsageDailyBreakdown,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";

const OPTIONAL_PRICING_INSIGHTS_TIMEOUT_MS = 2_500;

function withOptionalPricingTimeout<T>(
	promise: Promise<T>,
	fallback: T,
	label: string
): Promise<T> {
	let timeout: ReturnType<typeof setTimeout> | null = null;
	const timeoutPromise = new Promise<T>((resolve) => {
		timeout = setTimeout(() => {
			console.warn(`[pricing] ${label} timed out; using fallback.`);
			resolve(fallback);
		}, OPTIONAL_PRICING_INSIGHTS_TIMEOUT_MS);
	});

	return Promise.race([promise, timeoutPromise])
		.catch((error) => {
			console.warn(`[pricing] ${label} failed; using fallback.`, {
				error,
			});
			return fallback;
		})
		.finally(() => {
			if (timeout) clearTimeout(timeout);
		});
}

export default async function ModelPricingInsightsSection({
	modelId,
	includeHidden,
	showPageHeader = false,
}: {
	modelId: string;
	includeHidden: boolean;
	showPageHeader?: boolean;
}) {
	const providers = await withOptionalPricingTimeout(
		fetchFrontendModelPricing(modelId),
		[],
		"pricing providers"
	);
	const pendingApiRelease = await withOptionalPricingTimeout(
		fetchFrontendModelPendingApiReleaseState(modelId, includeHidden),
		null,
		"pending API release state"
	);
	const providersForDisplay = providers || [];
	const tEmpty = await getTranslations("Catalogue.modelDetail.emptyStates");
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
	if (!providersForDisplay.length) {
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
						<EmptyTitle>{tEmpty("noPricingTitle")}</EmptyTitle>
						<EmptyDescription>
							{tEmpty("noPricingDescription")}
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<EmptyDescription>
							{tEmpty("suggestProviders")}
						</EmptyDescription>
					</EmptyContent>
				</Empty>
			</div>
		);
	}

	const [pricingHistoryRules, usageRows, effectivePricingRows] = await Promise.all([
		withOptionalPricingTimeout(
			fetchFrontendModelPricingHistory(modelId, {
				includeHidden,
				days: 3650,
			}),
			[],
			"pricing history rules"
		),
		withOptionalPricingTimeout(
			fetchFrontendModelUsageDailyBreakdown({
				modelId,
				providerIds,
				modelAliases,
				days: 365,
			}),
			[],
			"usage breakdown"
		),
		withOptionalPricingTimeout(
			fetchFrontendModelEffectivePricingDaily({
				modelId,
				providerIds,
				days: 365,
			}),
			[],
			"effective pricing"
		),
	]);

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
				historyRules={pricingHistoryRules}
				usageRows={usageRows}
				effectivePricingRows={effectivePricingRows}
				showPageHeader={showPageHeader}
			/>
		</div>
	);
}
