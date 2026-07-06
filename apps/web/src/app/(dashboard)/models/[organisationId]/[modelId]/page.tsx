import {
	fetchFrontendModelBenchmarkHighlights,
	fetchFrontendModelGatewayMetadata,
	fetchFrontendModelOverview,
	fetchFrontendModelPerformance,
	fetchFrontendModelPricing,
	fetchFrontendModelSubscriptionPlans,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";
import type { ModelOverviewPage } from "@/lib/fetchers/models/getModel";
import ModelOverviewSections, {
	ModelCreatorModelsSection,
	ModelCreatorModelsSkeleton,
} from "@/components/(data)/model/overview/ModelOverviewSections";
import ModelDetailShell from "@/components/(data)/model/ModelDetailShell";
import ModelPageToc, {
	type ModelPageTocItem,
} from "@/components/(data)/model/ModelPageToc";
import type { Metadata } from "next";
import { absoluteUrl, buildMetadata } from "@/lib/seo";
import {
	getModelPath,
	getModelMetadataIdentity,
	resolveModelRouteIds,
	type ModelRouteParams,
} from "@/components/(data)/model/model-route-helpers";
import { buildModelPageMetadataDescription } from "@/lib/models/modelDescription";
import { permanentRedirect } from "next/navigation";
import { Suspense } from "react";
import { isFreeRouterModelId } from "@/lib/models/freeRouter";
import FreeRouterOverview from "@/components/(data)/model/free-router/FreeRouterOverview";
import {
	resolveQuickstartRequestContext,
	type QuickstartSearchParams,
} from "@/components/(data)/model/quickstart/requestContext";
import { JsonLdScript } from "@/components/seo/JsonLdScript";
import {
	analyseModelIndexability,
	robotsForModelIndexability,
} from "@/lib/seo/modelIndexability";

async function ModelCreatorModelsSectionContent({
	modelId,
	includeHidden,
	modelPromise,
}: {
	modelId: string;
	includeHidden: boolean;
	modelPromise: Promise<ModelOverviewPage | null>;
}) {
	const model = await modelPromise;
	if (!model) return null;

	return (
		<div className="mt-10">
			<ModelCreatorModelsSection
				modelId={modelId}
				includeHidden={includeHidden}
				model={model}
			/>
		</div>
	);
}

const baseModelPageTocItems: ModelPageTocItem[] = [
	{ id: "providers", label: "Providers" },
	{ id: "performance", label: "Performance" },
	{ id: "pricing", label: "Pricing" },
	{ id: "benchmarks", label: "Benchmarks" },
	{ id: "activity", label: "Activity" },
	{ id: "apps", label: "Apps" },
	{ id: "uptime", label: "Uptime" },
	{ id: "quickstart", label: "Quickstart" },
	{ id: "about", label: "About" },
	{ id: "subscriptions", label: "Subscriptions" },
];

function getModelPageTocItems({
	showBenchmarks,
	showSubscriptions,
	status,
}: {
	showBenchmarks: boolean;
	showSubscriptions: boolean;
	status?: string | null;
}): ModelPageTocItem[] {
	if (status === "Retired") {
		return baseModelPageTocItems.filter((item) => {
			if (item.id === "benchmarks") return showBenchmarks;
			if (item.id === "subscriptions") return showSubscriptions;
			return item.id === "about";
		});
	}

	return baseModelPageTocItems.filter((item) => {
		if (item.id === "benchmarks") return showBenchmarks;
		if (item.id === "subscriptions") return showSubscriptions;
		return true;
	});
}

export async function generateMetadata(props: {
	params: Promise<ModelRouteParams>;
}): Promise<Metadata> {
	const params = await props.params;
	const { modelId, modelName, organisationName, modelDescription } = await getModelMetadataIdentity(
		params,
		false,
	);
	const path = getModelPath(modelId);
	const imagePath = `/og/models/${modelId}`;
	const [
		modelOverview,
		benchmarkHighlights,
		gatewayMetadata,
		pricingProviders,
		subscriptionPlans,
	] = await Promise.all([
		fetchFrontendModelOverview(modelId).catch(() => null),
		fetchFrontendModelBenchmarkHighlights(modelId).catch(() => []),
		fetchFrontendModelGatewayMetadata(modelId).catch(() => null),
		fetchFrontendModelPricing(modelId).catch(() => []),
		fetchFrontendModelSubscriptionPlans(modelId).catch(() => []),
	]);
	const indexability = isFreeRouterModelId(modelId)
		? analyseModelIndexability({
				modelId,
				name: modelName,
				organisationName,
				description: modelDescription,
				providerCount: 1,
				inputTypes: ["text"],
				outputTypes: ["text"],
			})
		: analyseModelIndexability({
				modelId,
				name: modelName,
				organisationName,
				description: modelDescription,
				status: modelOverview?.status,
				releaseDate: modelOverview?.release_date,
				announcementDate: modelOverview?.announcement_date,
				updatedAt: modelOverview?.updated_at,
				apiModelIds: gatewayMetadata?.apiModelIds,
				inputTypes: modelOverview?.input_types,
				outputTypes: modelOverview?.output_types,
				modelDetails: modelOverview?.model_details,
				modelLinks: modelOverview?.model_links,
				benchmarkCount: benchmarkHighlights.length,
				providerCount: gatewayMetadata?.providers.length ?? 0,
				activeProviderCount: gatewayMetadata?.activeProviders.length ?? 0,
				pricingRuleCount: pricingProviders.reduce(
					(total, provider) => total + provider.pricing_rules.length,
					0,
				),
				contextLengths: gatewayMetadata?.providers.map(
					(provider) => provider.context_length,
				),
				supportedParameters: Object.values(
					gatewayMetadata?.supportedParametersByEndpoint ?? {},
				).flatMap((parameters) =>
					parameters.map((parameter) => parameter.param_id),
				),
				hasSubscriptionPlans: subscriptionPlans.length > 0,
			});

	return buildMetadata({
		title: `${modelName} Pricing, Benchmarks, Latency & Providers`,
		description: buildModelPageMetadataDescription({
			modelDescription,
			suffix:
				"Compare pricing, benchmarks, providers, latency signals, and compatibility details on AI Stats.",
			fallback: `Compare pricing, benchmarks, providers, latency signals, and compatibility details for ${modelName} on AI Stats.`,
		}),
		path,
		keywords: [
			modelName,
			`${modelName} benchmarks`,
			`${modelName} pricing`,
			organisationName ? `${organisationName} AI` : null,
			"AI Stats",
			"AI model comparison",
		].filter(Boolean) as string[],
		imagePath,
		robots: robotsForModelIndexability(indexability),
	});
}

export default async function Page({
	params,
	searchParams,
}: {
	params: Promise<ModelRouteParams>;
	searchParams: Promise<QuickstartSearchParams>;
}) {
	const [routeParams, routeSearchParams] = await Promise.all([
		params,
		searchParams,
	]);
	const includeHidden = false;
	const quickstartRequestContext =
		resolveQuickstartRequestContext(routeSearchParams);
	const { requestedModelId, canonicalModelId } = await resolveModelRouteIds(
		routeParams,
		includeHidden,
	);
	if (canonicalModelId !== requestedModelId) {
		permanentRedirect(getModelPath(canonicalModelId));
	}
	const modelId = canonicalModelId;
	if (isFreeRouterModelId(modelId)) {
		return (
			<ModelDetailShell modelId={modelId} tab="overview" includeHidden={includeHidden}>
				<FreeRouterOverview />
			</ModelDetailShell>
		);
	}
	const modelPromise = fetchFrontendModelOverview(modelId);
	const performancePromise = fetchFrontendModelPerformance(modelId, 24).catch(
		() => null,
	);
	const [modelOverview, benchmarkHighlights, subscriptionPlans] =
		await Promise.all([
			modelPromise,
			fetchFrontendModelBenchmarkHighlights(modelId).catch(() => []),
			fetchFrontendModelSubscriptionPlans(modelId).catch(() => []),
		]);
	const showBenchmarks = benchmarkHighlights.length > 0;
	const showSubscriptions = subscriptionPlans.length > 0;
	const isRetired = modelOverview?.status === "Retired";
	const modelPageTocItems = getModelPageTocItems({
		showBenchmarks,
		showSubscriptions,
		status: modelOverview?.status,
	});
	const modelName = modelOverview?.name ?? modelId.split("/").slice(-1)[0] ?? modelId;
	const organisationName =
		modelOverview?.organisation?.name ?? routeParams.organisationId;
	const datasetSchema = {
		"@context": "https://schema.org",
		"@type": "Dataset",
		name: `${organisationName} ${modelName}`.trim(),
		description: `AI Stats profile for ${modelName} with pricing, benchmarks, providers, latency signals, and gateway compatibility details.`,
		url: absoluteUrl(getModelPath(modelId)),
		creator: {
			"@type": "Organization",
			name: organisationName,
		},
		keywords: [
			modelName,
			`${modelName} pricing`,
			`${modelName} benchmarks`,
			`${modelName} providers`,
		],
		dateModified:
			modelOverview?.updated_at ??
			modelOverview?.release_date ??
			modelOverview?.announcement_date ??
			undefined,
	};
	const breadcrumbSchema = {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: [
			{
				"@type": "ListItem",
				position: 1,
				name: "Home",
				item: absoluteUrl("/"),
			},
			{
				"@type": "ListItem",
				position: 2,
				name: "Models",
				item: absoluteUrl("/models"),
			},
			{
				"@type": "ListItem",
				position: 3,
				name: modelName,
				item: absoluteUrl(getModelPath(modelId)),
			},
		],
	};

	return (
		<>
			<JsonLdScript
				id="model-dataset-schema"
				data={datasetSchema}
			/>
			<JsonLdScript
				id="model-breadcrumb-schema"
				data={breadcrumbSchema}
			/>
			<ModelDetailShell modelId={modelId} tab="overview" includeHidden={includeHidden}>
				<div className="space-y-10">
					<div className="grid gap-8 lg:grid-cols-[220px,minmax(0,1fr)] xl:grid-cols-[240px,minmax(0,1fr)]">
						<ModelPageToc items={modelPageTocItems} className="lg:col-start-1 lg:h-full" />
						<div className="min-w-0 space-y-10 lg:col-start-2">
							<ModelOverviewSections
								modelId={modelId}
								model={modelOverview}
								includeHidden={includeHidden}
								showBenchmarks={showBenchmarks}
								showSubscriptions={showSubscriptions}
								status={modelOverview?.status}
								performancePromise={performancePromise}
								quickstartRequestContext={quickstartRequestContext}
							/>
						</div>
					</div>
					{isRetired ? null : (
						<Suspense fallback={<ModelCreatorModelsSkeleton />}>
							<ModelCreatorModelsSectionContent
								modelId={modelId}
								includeHidden={includeHidden}
								modelPromise={modelPromise}
							/>
						</Suspense>
					)}
				</div>
			</ModelDetailShell>
		</>
	);
}
