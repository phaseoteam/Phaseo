import {
	fetchFrontendModelBenchmarkHighlights,
	fetchFrontendModelAvailability,
	fetchFrontendModelHeader,
	fetchFrontendModelGatewayMetadata,
	fetchFrontendModelOverview,
	fetchFrontendModelPerformance,
	fetchFrontendModelPricing,
	fetchFrontendModelSubscriptionPlans,
	fetchFrontendModelTimeline,
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
import {
	buildModelOverviewMetadataDescription,
	buildModelOverviewMetadataTitle,
} from "@/lib/models/modelDescription";
import {
	analyseModelIndexability,
	robotsForModelIndexability,
} from "@/lib/seo/modelIndexability";
import { notFound, permanentRedirect } from "next/navigation";
import { Suspense } from "react";
import { isFreeRouterModelId } from "@/lib/models/freeRouter";
import FreeRouterOverview from "@/components/(data)/model/free-router/FreeRouterOverview";
import { JsonLdScript } from "@/components/seo/JsonLdScript";
import ModelFaqSection from "@/components/(data)/model/overview/ModelFaqSection";
import {
	getModelLineageLinks,
	resolveModelLineageNames,
} from "@/components/(data)/model/overview/modelOverviewMetadata";
import { supportsProvenanceVerification } from "@/components/(data)/model/overview/ModelVerificationSection";
import { getLocale, getTranslations } from "next-intl/server";

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

async function ModelFaqSectionContent({
	model,
	benchmarkCount,
	activeProviderCount,
	isGatewayActive,
	pricingPromise,
	gatewayMetadataPromise,
}: {
	model: ModelOverviewPage;
	benchmarkCount: number;
	activeProviderCount: number;
	isGatewayActive: boolean;
	pricingPromise: ReturnType<typeof fetchFrontendModelPricing>;
	gatewayMetadataPromise: Promise<
		Awaited<ReturnType<typeof fetchFrontendModelGatewayMetadata>> | null
	>;
}) {
	const locale = await getLocale();
	const translateFaq = await getTranslations("Catalogue.models.detail.faqContent");
	const translateModality = await getTranslations("Common.ui.modelCreation.modalities");
	const translatePricing = await getTranslations("Catalogue.modelDetail.pricing");
	const [pricing, timeline, gatewayMetadata] = await Promise.all([
		pricingPromise,
		fetchFrontendModelTimeline(model.model_id).catch(() => null),
		gatewayMetadataPromise.catch(() => null),
	]);
	const relatedModels = await resolveModelLineageNames(
		getModelLineageLinks(timeline?.events, model.previous_model_id),
		async (relatedModelId) =>
			(
				await fetchFrontendModelHeader(relatedModelId).catch(() => null)
			)?.name,
	);
	return (
		<ModelFaqSection
			model={model}
			benchmarkCount={benchmarkCount}
			activeProviderCount={activeProviderCount}
			isGatewayActive={isGatewayActive}
			pricing={pricing}
			relatedModels={relatedModels}
			gatewayMetadata={gatewayMetadata}
			translate={(key, values) => translateFaq(key as never, values as never)}
			translateModality={(key) => translateModality(key as never)}
			translatePricing={(key, values) => translatePricing(key as never, values as never)}
			locale={locale}
		/>
	);
}

function getModelPageTocItems({
	showBenchmarks,
	showSubscriptions,
	status,
	isGatewayActive,
	showVerification,
	labels,
}: {
	showBenchmarks: boolean;
	showSubscriptions: boolean;
	status?: string | null;
	isGatewayActive: boolean;
	showVerification: boolean;
	labels: Record<string, string>;
}): ModelPageTocItem[] {
	const baseModelPageTocItems: ModelPageTocItem[] = [
		{ id: "providers", label: labels.providers },
		{ id: "performance", label: labels.performance },
		{ id: "pricing", label: labels.pricing },
		{ id: "benchmarks", label: labels.benchmarks },
		{ id: "activity", label: labels.activity },
		{ id: "apps", label: labels.apps },
		{ id: "uptime", label: labels.uptime },
		{ id: "verification", label: labels.verification },
		{ id: "about", label: labels.about },
		{ id: "subscriptions", label: labels.subscriptions },
		{ id: "faq", label: labels.faq },
	];
	if (status === "Retired") {
		return baseModelPageTocItems.filter((item) => {
			if (item.id === "benchmarks") return showBenchmarks;
			if (item.id === "subscriptions") return showSubscriptions;
			if (item.id === "verification") return showVerification;
			return item.id === "about" || item.id === "faq";
		});
	}

	return baseModelPageTocItems.filter((item) => {
		if (
			!isGatewayActive &&
			["performance", "pricing", "activity", "apps", "uptime"].includes(item.id)
		) {
			return false;
		}
		if (item.id === "benchmarks") return showBenchmarks;
		if (item.id === "subscriptions") return showSubscriptions;
		if (item.id === "verification") return showVerification;
		return true;
	});
}

export async function generateMetadata(props: {
	params: Promise<ModelRouteParams>;
}): Promise<Metadata> {
	const params = await props.params;
	const identity = await getModelMetadataIdentity(
		params,
		false,
	);
	const { modelId, modelName, organisationName, modelDescription } = identity;
	const model = await fetchFrontendModelOverview(modelId).catch(() => null);
	const [benchmarks, pricing, gatewayMetadata, subscriptions] = await Promise.all([
		fetchFrontendModelBenchmarkHighlights(modelId).catch(() => []),
		fetchFrontendModelPricing(modelId).catch(() => []),
		fetchFrontendModelGatewayMetadata(modelId).catch(() => null),
		fetchFrontendModelSubscriptionPlans(modelId).catch(() => []),
	]);
	const providerCount = gatewayMetadata?.providers.length ?? 0;
	const activeProviderCount = gatewayMetadata?.activeProviders.length ?? 0;
	const analysis = model
		? analyseModelIndexability({
				modelId: model.model_id,
				name: model.name,
				organisationId: model.organisation_id,
				organisationName: model.organisation?.name,
				description: model.description,
				status: model.status,
				releaseDate: model.release_date,
				announcementDate: model.announcement_date,
				updatedAt: model.updated_at,
				apiModelIds: gatewayMetadata?.apiModelIds,
				inputTypes: model.input_types,
				outputTypes: model.output_types,
				modelDetails: model.model_details,
				modelLinks: model.model_links,
				benchmarkCount: benchmarks.length,
				providerCount,
				activeProviderCount,
				pricingRuleCount: pricing.flatMap((entry) => entry.pricing_rules).length,
				contextLengths: gatewayMetadata?.providers.map((entry) => entry.context_length),
				supportedParameters: Object.values(
					gatewayMetadata?.supportedParametersByEndpoint ?? {},
				).flatMap((entries) => entries.map((entry) => entry.param_id)),
				hasSubscriptionPlans: subscriptions.length > 0,
			})
		: analyseModelIndexability({ modelId, name: modelName, organisationName });
	const path = getModelPath(modelId);
	const imagePath = `/og/models/${modelId}`;
	const translateTitle = await getTranslations("Catalogue.models.detail.seoTitles");
	return buildMetadata({
		title: buildModelOverviewMetadataTitle(modelName, {
			providerCount,
			benchmarkCount: benchmarks.length,
			hasPricing: pricing.length > 0,
			contextLength: gatewayMetadata?.providers
				.map((entry) => entry.context_length ?? 0)
				.filter((value) => value > 0)
				.sort((left, right) => right - left)[0],
		}, (key, values) => translateTitle(key as never, values as never)),
		description: buildModelOverviewMetadataDescription({
			modelName,
			organisationName,
			modelDescription,
			providerCount,
			benchmarkCount: benchmarks.length,
			hasPricing: pricing.length > 0,
		}),
		path,
		keywords: [
			modelName,
			`${modelName} benchmarks`,
			`${modelName} pricing`,
			organisationName ? `${organisationName} AI` : null,
			"Phaseo",
			"AI model comparison",
		].filter(Boolean) as string[],
		imagePath,
		robots: isFreeRouterModelId(modelId)
			? { index: true, follow: true }
			: robotsForModelIndexability(analysis),
	});
}

export default async function Page({
	params,
}: {
	params: Promise<ModelRouteParams>;
}) {
	const routeParams = await params;
	const includeHidden = false;
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
	const benchmarkPromise = fetchFrontendModelBenchmarkHighlights(modelId).catch(() => []);
	const subscriptionPromise = fetchFrontendModelSubscriptionPlans(modelId).catch(() => []);
	const availabilityPromise = fetchFrontendModelAvailability(modelId).catch(() => undefined);
	const pricingPromise = fetchFrontendModelPricing(modelId).catch(() => []);
	const gatewayMetadataPromise = fetchFrontendModelGatewayMetadata(modelId).catch(
		() => null,
	);
	const [modelOverview, benchmarkHighlights, subscriptionPlans, availability] =
		await Promise.all([
			modelPromise,
			benchmarkPromise,
			subscriptionPromise,
			availabilityPromise,
		]);
	if (!modelOverview) notFound();
	const showBenchmarks = benchmarkHighlights.length > 0;
	const showSubscriptions = subscriptionPlans.length > 0;
	const isGatewayActive =
		availability?.isGatewayActive ?? true;
	const resolvedPerformancePromise = isGatewayActive
		? fetchFrontendModelPerformance(modelId, 24).catch(() => null)
		: Promise.resolve(null);
	const isRetired = modelOverview?.status === "Retired";
	const t = await getTranslations("Catalogue.models.detail.navigation");
	const modelPageTocItems = getModelPageTocItems({
		showBenchmarks,
		showSubscriptions,
		status: modelOverview?.status,
		isGatewayActive,
		showVerification: supportsProvenanceVerification(modelOverview.output_types),
		labels: {
			providers: t("providers"),
			performance: t("performance"),
			pricing: t("pricing"),
			benchmarks: t("benchmarks"),
			activity: t("activity"),
			apps: t("apps"),
			uptime: t("uptime"),
			verification: t("verification"),
			about: t("about"),
			subscriptions: t("subscriptions"),
			faq: t("faq"),
		},
	});
	const modelName = modelOverview?.name ?? modelId.split("/").slice(-1)[0] ?? modelId;
	const organisationName =
		modelOverview?.organisation?.name ?? routeParams.organisationId;
	const modelHeader = modelOverview ? {
		model_id: modelOverview.model_id,
		name: modelOverview.name,
		organisation_id: modelOverview.organisation_id,
		organisation: {
			name: modelOverview.organisation.name,
			country_code: modelOverview.organisation.country_code ?? "",
		},
		aliases: modelOverview.aliases ?? [],
		family_id: modelOverview.family_id ?? undefined,
		status: modelOverview.status,
		hidden: false,
	} : undefined;
	const datasetSchema = {
		"@context": "https://schema.org",
		"@type": "Dataset",
		name: `${organisationName} ${modelName}`.trim(),
		description: `Phaseo profile for ${modelName} with pricing, benchmarks, providers, latency signals, and gateway compatibility details.`,
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
			<ModelDetailShell modelId={modelId} tab="overview" includeHidden={includeHidden} header={modelHeader} modelOverview={modelOverview}>
				<div className="space-y-10">
					<div className="flex flex-col gap-6 lg:flex-row lg:items-start">
						<ModelPageToc
							items={modelPageTocItems}
							className="lg:h-full lg:w-40 lg:shrink-0 xl:w-44"
						/>
						<div className="min-w-0 flex-1 space-y-10">
							<ModelOverviewSections
								modelId={modelId}
								model={modelOverview}
								includeHidden={includeHidden}
								showBenchmarks={showBenchmarks}
								showSubscriptions={showSubscriptions}
								status={modelOverview?.status}
								isGatewayActive={isGatewayActive}
								performancePromise={resolvedPerformancePromise}
							/>
							{modelOverview ? (
								<Suspense fallback={null}>
									<ModelFaqSectionContent
										model={modelOverview}
										benchmarkCount={benchmarkHighlights.length}
										activeProviderCount={availability?.activeProviderCount ?? 0}
										isGatewayActive={isGatewayActive}
										pricingPromise={pricingPromise}
										gatewayMetadataPromise={gatewayMetadataPromise}
									/>
								</Suspense>
							) : null}
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
