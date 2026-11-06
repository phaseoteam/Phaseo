import { getModelAccessLayout } from "@/lib/models/modelAccessLayout";
import {
	fetchFrontendModelBenchmarkHighlights,
	fetchFrontendModelGatewayMetadata,
	fetchFrontendModelOverview,
	fetchFrontendModelPricing,
	fetchFrontendModelSubscriptionPlans,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";
import type { ModelOverviewPage } from "@/lib/fetchers/models/getModel";
import ModelOverviewSections, {
	ModelCreatorModelsSection,
	ModelCreatorModelsSkeleton,
	ModelOverviewSectionsSkeleton,
} from "@/components/(data)/model/overview/ModelOverviewSections";
import ModelDetailShell from "@/components/(data)/model/ModelDetailShell";
import { DiscordComponentEmbed } from "@/components/metadata/DiscordComponentEmbed";
import ModelPageToc, {
	type ModelPageTocItem,
} from "@/components/(data)/model/ModelPageToc";
import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { absoluteUrl, buildMetadata } from "@/lib/seo";
import {
	getModelPath,
	getModelMetadataIdentity,
	type ModelRouteParams,
} from "@/components/(data)/model/model-route-helpers";
import {
	buildModelOverviewMetadataDescription,
	buildModelOverviewMetadataTitle,
	countModelMetadataProviders,
	markdownToPlainText,
} from "@/lib/models/modelDescription";
import {
	analyseModelIndexability,
	robotsForModelIndexability,
} from "@/lib/seo/modelIndexability";
import { notFound, permanentRedirect } from "@/lib/navigation";
import { Suspense } from "react";
import { useSuspenseQueries, useSuspenseQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useLocale, useTranslations } from "@/i18n/react";
import type { RouteMetadataInput } from "@/lib/start/metadata";
import {
	modelPageBodyQueries,
	modelPageFaqRelatedModelsQuery,
	modelPagePricingQuery,
	modelPagePrivatePerformanceQuery,
	modelPageQuery,
} from "./page.queries";
import { isFreeRouterModelId } from "@/lib/models/freeRouter";
import FreeRouterOverview from "@/components/(data)/model/free-router/FreeRouterOverview";
import ProviderCatalogPreviewDetail from "@/components/(data)/model/ProviderCatalogPreviewDetail";
import { JsonLdScript } from "@/components/seo/JsonLdScript";
import ModelFaqSection from "@/components/(data)/model/overview/ModelFaqSection";
import { supportsProvenanceVerification } from "@/components/(data)/model/overview/ModelVerificationSection";
import { getTranslations } from "@/i18n/server";
import type { fetchPrivateModelPerformance } from "@/lib/fetchers/internal/fetchSettingsPrivateModels";
import type { ModelGatewayMetadata } from "@/lib/fetchers/models/getModelGatewayMetadata";
import type { ModelPerformanceMetrics } from "@/lib/fetchers/models/getModelPerformance";
import type { ProviderPricing } from "@/lib/fetchers/models/getModelPricing";
import { resolveProviderDisplayName } from "@/lib/providers/providerOffers";

function privateModelGatewayMetadata(model: ModelOverviewPage, endpointLabel: string): ModelGatewayMetadata {
	const provider = {
		id: `private-model:${model.model_id}:chat.completions`, api_provider_id: "private-model",
		model_id: model.model_id, endpoint: "chat.completions", is_active_gateway: true,
		availability_status: "active" as const, availability_reason: "active" as const,
		provider_availability_status: "available" as const, phaseo_status: "enabled" as const,
		access_scope: null, input_modalities: "text", output_modalities: "text",
		provider: { api_provider_id: "private-model", api_provider_name: endpointLabel },
	};
	return {
		modelId: model.model_id, aliases: [], apiModelIds: [model.model_id],
		primaryModelIdentifier: model.model_id, acceptedModelIdentifiers: [model.model_id],
		primaryModelIdentifierByEndpoint: { "chat.completions": model.model_id },
		acceptedModelIdentifiersByEndpoint: { "chat.completions": [model.model_id] },
		supportedParametersByEndpoint: {}, providers: [provider], activeProviders: [provider],
		comingSoonProviders: [], inactiveProviders: [],
	};
}

function privateModelPerformanceMetrics(model: ModelOverviewPage, data: Awaited<ReturnType<typeof fetchPrivateModelPerformance>>): ModelPerformanceMetrics | null {
	if (!data) return null;
	const now = new Date(); const start = new Date(now.getTime() - 30 * 86_400_000);
	const providerId = String(model.model_details.find((detail) => detail.detail_name === "hosting provider")?.detail_value ?? "private-model");
	const providerName = resolveProviderDisplayName({ providerId, providerName: providerId });
	const bucket = data.lastRequestAt ?? now.toISOString();
	const point = { bucket, avgThroughput: data.averageThroughput, avgLatencyMs: data.averageLatencyMs, avgGenerationMs: data.averageGenerationMs, requests: data.requests, successPct: data.successRate };
	const providerPoint = { provider: providerId, providerName, providerColor: null, avgThroughput: data.averageThroughput, avgLatencyMs: data.averageLatencyMs, avgEndToEndMs: data.averageLatencyMs, avgGenerationMs: data.averageGenerationMs, requests: data.requests };
	return { summary: { avgThroughput: data.averageThroughput, avgLatencyMs: data.averageLatencyMs, avgGenerationMs: data.averageGenerationMs, uptimePct: data.successRate, totalRequests: data.requests, successfulRequests: data.successfulRequests }, hourly: data.requests ? [point] : [], successSeries: data.requests ? [{ bucket, overallSuccessPct: data.successRate, worstProviderSuccessPct: data.successRate, providerCount: 1, requests: data.requests }] : [], timeOfDay: data.requests ? [{ hour: new Date(bucket).getUTCHours(), avgThroughput: data.averageThroughput, avgLatencyMs: data.averageLatencyMs, avgGenerationMs: data.averageGenerationMs, sampleCount: data.requests }] : [], providerPerformance: [{ provider: providerId, providerName, avgThroughput: data.averageThroughput, avgLatencyMs: data.averageLatencyMs, avgGenerationMs: data.averageGenerationMs, requests: data.requests, uptimePct: data.successRate, uptimeBuckets: data.requests ? [{ start: bucket, end: new Date(new Date(bucket).getTime() + 3_600_000).toISOString(), successPct: data.successRate }] : [] }], providerDaily7d: data.requests ? [{ ...providerPoint, day: bucket.slice(0, 10) }] : [], providerHourly7d: data.requests ? [{ ...providerPoint, bucket }] : [], dataRange: { start: start.toISOString(), end: now.toISOString() } };
}

function privateModelProviders(model: ModelOverviewPage, deploymentLabel: string, billingNote: string): ProviderPricing[] {
	const providerId = String(model.model_details.find((detail) => detail.detail_name === "hosting provider")?.detail_value ?? "private-model");
	const effectiveFrom = new Date(0).toISOString(); const modelKey = `${providerId}:${model.model_id}:chat.completions`;
	const rule = (meter: string) => ({ id: `private-${meter}`, model_key: modelKey, pricing_plan: "standard", meter, unit: "token", unit_size: 1, price_per_unit: 0, currency: "USD", note: billingNote, match: [], priority: 100, effective_from: effectiveFrom, effective_to: null });
	return [{ provider: { api_provider_id: providerId, api_provider_name: providerId, offer_label: deploymentLabel, offer_scope: "specialized", status: "active", routing_status: "active" }, provider_models: [{ id: `private-model:${model.model_id}`, api_provider_id: providerId, provider_model_slug: model.model_id, model_id: model.model_id, endpoint: "chat.completions", capability_status: "active", routing_status: "active", provider_availability_status: "available", phaseo_status: "enabled", access_scope: null, is_active_gateway: true, input_modalities: "text", output_modalities: "text" }], pricing_rules: [rule("input_tokens"), rule("output_tokens")] }];
}

function ModelCreatorModelsSectionContent({
	modelId,
	includeHidden,
	model,
}: {
	modelId: string;
	includeHidden: boolean;
	model: ModelOverviewPage | null;
}) {
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

function ModelFaqSectionContent({
	model,
	benchmarkCount,
	activeProviderCount,
	isGatewayActive,
	showProviders,
	includeHidden,
	gatewayMetadata,
}: {
	model: ModelOverviewPage;
	benchmarkCount: number;
	activeProviderCount: number;
	isGatewayActive: boolean;
	showProviders: boolean;
	includeHidden: boolean;
	gatewayMetadata: Awaited<ReturnType<typeof fetchFrontendModelGatewayMetadata>> | null;
}) {
	const locale = useLocale();
	const translateFaq = useTranslations("Catalogue.models.detail.faqContent");
	const translateModality = useTranslations("Common.ui.modelCreation.modalities");
	const translatePricing = useTranslations("Catalogue.modelDetail.pricing");
	const [{ data: pricing }, { data: relatedModels }] = useSuspenseQueries({
		queries: [
			modelPagePricingQuery(model.model_id, includeHidden),
			modelPageFaqRelatedModelsQuery(model.model_id, model.previous_model_id),
		],
	});
	return (
		<ModelFaqSection
			model={model}
			benchmarkCount={benchmarkCount}
			activeProviderCount={activeProviderCount}
			isGatewayActive={isGatewayActive}
			showProviders={showProviders}
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
	subscriptionOnly,
	showBenchmarks,
	showSubscriptions,
	status,
	isGatewayActive,
	showProviders,
	showVerification,
	labels,
	isPrivateModel = false,
}: {
	subscriptionOnly: boolean;
	showBenchmarks: boolean;
	showSubscriptions: boolean;
	status?: string | null;
	isGatewayActive: boolean;
	showProviders: boolean;
	showVerification: boolean;
	isPrivateModel?: boolean;
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
	if (isPrivateModel) return baseModelPageTocItems.filter((item) => ["providers", "performance", "activity", "uptime", "about", "faq"].includes(item.id));
	if (status === "Retired") {
		return baseModelPageTocItems.filter((item) => {
			if (item.id === "benchmarks") return showBenchmarks;
			if (item.id === "subscriptions") return showSubscriptions;
			if (item.id === "verification") return showVerification;
			return item.id === "about" || item.id === "faq";
		});
	}

	const orderedItems = subscriptionOnly
		? [
			...baseModelPageTocItems.filter((item) => item.id === "subscriptions"),
			...baseModelPageTocItems.filter((item) => item.id !== "subscriptions"),
		]
		: baseModelPageTocItems;
	return orderedItems.filter((item) => {
		if (item.id === "providers") return showProviders;
		if (
			(!isGatewayActive || subscriptionOnly) &&
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

export async function getModelMetadata({ params }: RouteMetadataInput): Promise<PageMetadata> {
	const identity = await getModelMetadataIdentity(
		{ organisationId: params.organisationId, modelId: params.modelId },
		false,
	);
	const { modelId, modelName, organisationName, modelDescription } = identity;
	// Social metadata must only describe models in the public catalogue, even
	// when an administrator or private-model owner visits this page.
	const model = await fetchFrontendModelOverview(modelId).catch(() => null);
	if (!model && !isFreeRouterModelId(modelId)) {
		const t = await getTranslations("Catalogue.catalogNotFound");
		return buildMetadata({
			title: t("modelUnavailableTitle"),
			description: t("modelDescription"),
			path: getModelPath(modelId),
			openGraph: { images: [] },
			twitter: { card: "summary", images: [] },
			robots: { index: false, follow: false },
		});
	}
	const [benchmarks, pricing, gatewayMetadata, subscriptions] = await Promise.all([
		fetchFrontendModelBenchmarkHighlights(modelId).catch(() => []),
		fetchFrontendModelPricing(modelId).catch(() => []),
		fetchFrontendModelGatewayMetadata(modelId).catch(() => null),
		fetchFrontendModelSubscriptionPlans(modelId).catch(() => []),
	]);
	const providerCount = countModelMetadataProviders(gatewayMetadata?.providers);
	const activeProviderCount = countModelMetadataProviders(gatewayMetadata?.activeProviders);
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

function ModelDetailPageBody({
	modelId,
	routeParams,
	prefetchedOverview,
	includeHidden,
}: {
	modelId: string;
	routeParams: ModelRouteParams;
	prefetchedOverview: ModelOverviewPage;
	includeHidden: boolean;
}) {
	const [
		{ data: benchmarkHighlights },
		{ data: subscriptionPlans },
		{ data: availability },
		{ data: gatewayMetadata },
		{ data: pricingProviders },
		{ data: providerPreviews },
	] = useSuspenseQueries({ queries: modelPageBodyQueries(modelId, includeHidden) });
	const modelOverview = prefetchedOverview;
	const privateT = useTranslations("Catalogue.models.detail.privateModel");
	const isPrivateModel = modelOverview.is_private === true;
	const effectiveGatewayMetadata = isPrivateModel ? privateModelGatewayMetadata(modelOverview, privateT("endpoint")) : gatewayMetadata;
	const { data: privatePerformance } = useSuspenseQuery(modelPagePrivatePerformanceQuery(modelId, isPrivateModel));
	const showBenchmarks = benchmarkHighlights.length > 0;
	const showSubscriptions = subscriptionPlans.length > 0;
	const hasApiProviders =
		(availability?.activeProviderCount ?? 0) > 0 ||
		(effectiveGatewayMetadata?.providers.length ?? 0) > 0 ||
		pricingProviders.some((provider) => provider.provider_models.length > 0);
	const { subscriptionOnly, showProviders } = getModelAccessLayout({
		hasSubscriptions: showSubscriptions,
		hasApiProviders,
		isPrivateModel,
		status: modelOverview.status,
		hasProviderPreviews: providerPreviews.length > 0,
	});
	const isGatewayActive = isPrivateModel
		? true
		: subscriptionOnly
		? false
		: availability?.isGatewayActive ?? true;
	// Public gateway models: ModelOverviewSections fetches performance itself
	// (same fetchFrontendModelPerformance(modelId, 24) fallback).
	const resolvedPerformancePromise = isPrivateModel
		? Promise.resolve(privateModelPerformanceMetrics(modelOverview, privatePerformance))
		: isGatewayActive
		? undefined
		: Promise.resolve(null);
	const isRetired = modelOverview?.status === "Retired";
	const t = useTranslations("Catalogue.models.detail.navigation");
	const modelPageTocItems = getModelPageTocItems({
		subscriptionOnly,
		showBenchmarks,
		showSubscriptions,
		status: modelOverview?.status,
		isGatewayActive,
		showProviders,
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
		isPrivateModel,
	});
	const modelName = modelOverview?.name ?? modelId.split("/").slice(-1)[0] ?? modelId;
	const organisationName =
		modelOverview?.organisation?.name ?? routeParams.organisationId;
	const contextLength =
		effectiveGatewayMetadata?.providers
			.map((provider) => provider.context_length ?? 0)
			.filter((value) => value > 0)
			.sort((left, right) => right - left)[0] ?? null;
	const discordDescription =
		markdownToPlainText(modelOverview.description) ??
		buildModelOverviewMetadataDescription({
			modelName,
			organisationName,
			providerCount: effectiveGatewayMetadata?.activeProviders.length ?? 0,
			benchmarkCount: benchmarkHighlights.length,
			hasPricing: pricingProviders.length > 0,
		});
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
			{!includeHidden && <DiscordComponentEmbed
				modelId={modelId}
				modelName={modelName}
				organisationName={organisationName}
				modelPath={getModelPath(modelId)}
				organisationId={modelOverview.organisation_id}
				description={discordDescription}
				contextLength={contextLength}
				organisationColour={
					modelOverview.organisation?.colour ??
					modelOverview.organisation?.color ??
					null
				}
				organisationLogoUrl={modelOverview.organisation?.logo_url}
			/>}
			{!includeHidden && <JsonLdScript
				id="model-dataset-schema"
				data={datasetSchema}
			/>}
			{!includeHidden && <JsonLdScript
				id="model-breadcrumb-schema"
				data={breadcrumbSchema}
			/>}
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
								subscriptionOnly={subscriptionOnly}
								showProviders={showProviders}
								status={modelOverview?.status}
								isGatewayActive={isGatewayActive}
								performancePromise={resolvedPerformancePromise}
								isPrivateModel={isPrivateModel}
								privateProviders={isPrivateModel ? privateModelProviders(modelOverview, privateT("deployment"), privateT("billingNote")) : undefined}
								previewOffers={providerPreviews}
								showPreviewDetails={providerPreviews.length > 0}
							/>
							{modelOverview ? (
								<Suspense fallback={null}>
									<ModelFaqSectionContent
										model={modelOverview}
										benchmarkCount={benchmarkHighlights.length}
										activeProviderCount={isPrivateModel ? 1 : availability?.activeProviderCount ?? effectiveGatewayMetadata?.activeProviders.length ?? 0}
										isGatewayActive={isGatewayActive}
										showProviders={showProviders}
										includeHidden={includeHidden}
										gatewayMetadata={effectiveGatewayMetadata}
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
								model={modelOverview}
							/>
						</Suspense>
					)}
			</div>
		</>
	);
}

export default function ModelPage() {
	const { organisationId, modelId: requestedModelId } = useParams({ from: "/{-$locale}/_dashboard/models/$organisationId/$modelId/" });
	const routeParams: ModelRouteParams = { organisationId, modelId: requestedModelId };
	// Redirects to the canonical id and unknown ids are handled by the route
	// loader before rendering (see page.functions.ts resolveModelPage).
	const { data: resolution } = useSuspenseQuery(modelPageQuery({ organisationId: routeParams.organisationId, modelId: routeParams.modelId }));
	const tRouter = useTranslations("Catalogue.models.freeRouter");
	if (resolution.kind === "redirect") permanentRedirect(resolution.to);
	if (resolution.kind === "not-found") notFound();
	if (resolution.kind === "preview") return <ProviderCatalogPreviewDetail preview={resolution.preview} />;
	if (resolution.kind === "free-router") {
		const { modelId, requestedAlias } = resolution;
		const includeHidden = false;
		return (
			<>
				<DiscordComponentEmbed
					modelId={modelId}
					modelName="Free Router"
					organisationName="Phaseo"
					modelPath={getModelPath(modelId)}
					description={tRouter("embedDescription")}
				/>
				<ModelDetailShell modelId={modelId} tab="overview" includeHidden={includeHidden} requestedAlias={requestedAlias}>
					<FreeRouterOverview />
				</ModelDetailShell>
			</>
		);
	}
	const { modelId, requestedAlias, includeHidden, canChatInternal, modelOverview } = resolution;
	const modelHeader = {
		model_id: modelOverview.model_id,
		name: modelOverview.name,
		organisation_id: modelOverview.organisation_id,
		organisation: {
			name: modelOverview.organisation.name,
			country_code: modelOverview.organisation.country_code ?? "",
			logo_url: modelOverview.organisation.logo_url ?? null,
		},
		aliases: modelOverview.aliases ?? [],
		family_id: modelOverview.family_id ?? undefined,
		status: modelOverview.status,
		hidden: includeHidden,
		is_private: modelOverview.is_private === true,
	};
	return (
	<ModelDetailShell modelId={modelId} tab="overview" includeHidden={includeHidden} header={modelHeader} modelOverview={modelOverview} requestedAlias={requestedAlias} canChat={includeHidden ? canChatInternal : undefined} canCompare={!includeHidden}>
			<Suspense fallback={<ModelOverviewSectionsSkeleton />}>
				<ModelDetailPageBody
					modelId={modelId}
					routeParams={routeParams}
					prefetchedOverview={modelOverview}
					includeHidden={includeHidden}
				/>
			</Suspense>
		</ModelDetailShell>
	);
}
