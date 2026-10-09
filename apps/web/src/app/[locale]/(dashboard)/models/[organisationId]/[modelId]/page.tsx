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
	ModelOverviewSectionsSkeleton,
} from "@/components/(data)/model/overview/ModelOverviewSections";
import ModelDetailShell from "@/components/(data)/model/ModelDetailShell";
import { DiscordComponentEmbed } from "@/components/metadata/DiscordComponentEmbed";
import ModelPageToc, {
	type ModelPageTocItem,
} from "@/components/(data)/model/ModelPageToc";
import type { Metadata } from "next";
import { absoluteUrl, buildMetadata } from "@/lib/seo";
import {
	getModelPath,
	getModelMetadataIdentity,
	isModelAliasRoute,
	resolveModelRouteIds,
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
import { notFound, permanentRedirect } from "next/navigation";
import { Suspense } from "react";
import { isFreeRouterModelId } from "@/lib/models/freeRouter";
import FreeRouterOverview from "@/components/(data)/model/free-router/FreeRouterOverview";
import ProviderCatalogPreviewDetail from "@/components/(data)/model/ProviderCatalogPreviewDetail";
import { fetchServerProviderCatalogPreviewsForModel } from "@/lib/fetchers/internal/fetchServerProviderCatalogPreviews";
import { JsonLdScript } from "@/components/seo/JsonLdScript";
import ModelFaqSection from "@/components/(data)/model/overview/ModelFaqSection";
import {
	getModelLineageLinks,
	resolveModelLineageNames,
} from "@/components/(data)/model/overview/modelOverviewMetadata";
import { supportsProvenanceVerification } from "@/components/(data)/model/overview/ModelVerificationSection";
import { getLocale, getTranslations } from "next-intl/server";
import { withOptionalProviderVisibilityTimeout } from "@/lib/models/providerVisibilityTimeout";
import { fetchPrivateModelOverview, fetchPrivateModelPerformance } from "@/lib/fetchers/internal/fetchSettingsPrivateModels";
import type { ModelGatewayMetadata } from "@/lib/fetchers/models/getModelGatewayMetadata";
import type { ModelPerformanceMetrics } from "@/lib/fetchers/models/getModelPerformance";
import type { ProviderPricing } from "@/lib/fetchers/models/getModelPricing";
import { resolveProviderDisplayName } from "@/lib/providers/providerOffers";
import { isAdminViewer } from "@/lib/auth/getViewerRole";
import { fetchAdminModelSource } from "@/lib/fetchers/internal/fetchAdminModelSource";
import { toAdminModelOverview } from "@/lib/models/adminModelOverview";

const MODEL_PROVIDER_VISIBILITY_TIMEOUT_MS = 1_000;

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
	showProviders,
	pricingPromise,
	gatewayMetadataPromise,
}: {
	model: ModelOverviewPage;
	benchmarkCount: number;
	activeProviderCount: number;
	isGatewayActive: boolean;
	showProviders: boolean;
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
	showBenchmarks,
	showSubscriptions,
	status,
	isGatewayActive,
	showProviders,
	showVerification,
	labels,
	isPrivateModel = false,
}: {
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

	return baseModelPageTocItems.filter((item) => {
		if (item.id === "providers") return showProviders;
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
	const [model, benchmarks, pricing, gatewayMetadata, subscriptions] = await Promise.all([
		fetchFrontendModelOverview(modelId).then(async (overview) => overview ?? await fetchPrivateModelOverview(modelId)).catch(() => fetchPrivateModelOverview(modelId).catch(() => null)),
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

async function ModelDetailPageBody({
	modelId,
	routeParams,
	prefetchedOverview,
	includeHidden,
	benchmarkPromise,
	subscriptionPromise,
	availabilityPromise,
	pricingPromise,
	gatewayMetadataPromise,
	providerPreviewsPromise,
	abortPricing,
}: {
	modelId: string;
	routeParams: ModelRouteParams;
	prefetchedOverview: ModelOverviewPage;
	includeHidden: boolean;
	benchmarkPromise: ReturnType<typeof fetchFrontendModelBenchmarkHighlights>;
	subscriptionPromise: ReturnType<typeof fetchFrontendModelSubscriptionPlans>;
	availabilityPromise: Promise<Awaited<ReturnType<typeof fetchFrontendModelAvailability>> | undefined>;
	pricingPromise: ReturnType<typeof fetchFrontendModelPricing>;
	gatewayMetadataPromise: Promise<Awaited<ReturnType<typeof fetchFrontendModelGatewayMetadata>> | null>;
	providerPreviewsPromise: ReturnType<typeof fetchServerProviderCatalogPreviewsForModel>;
	abortPricing: () => void;
}) {
	const modelPromise = Promise.resolve(prefetchedOverview);
	const gatewayMetadataForVisibilityPromise = withOptionalProviderVisibilityTimeout(
		gatewayMetadataPromise,
		null,
		MODEL_PROVIDER_VISIBILITY_TIMEOUT_MS,
	);
	const pricingForVisibilityPromise = withOptionalProviderVisibilityTimeout(
		pricingPromise,
		[],
		MODEL_PROVIDER_VISIBILITY_TIMEOUT_MS,
		abortPricing,
	);
	const [modelOverview, benchmarkHighlights, subscriptionPlans, availability, gatewayMetadata, pricingProviders, providerPreviews] =
		await Promise.all([
			modelPromise,
			benchmarkPromise,
			subscriptionPromise,
			availabilityPromise,
			gatewayMetadataForVisibilityPromise,
			pricingForVisibilityPromise,
			providerPreviewsPromise,
		]);
	if (!modelOverview) notFound();
	const privateT = await getTranslations("Catalogue.models.detail.privateModel");
	const isPrivateModel = modelOverview.is_private === true;
	const effectiveGatewayMetadata = isPrivateModel ? privateModelGatewayMetadata(modelOverview, privateT("endpoint")) : gatewayMetadata;
	const privatePerformance = isPrivateModel ? await fetchPrivateModelPerformance(modelId) : null;
	const showBenchmarks = benchmarkHighlights.length > 0;
	const showSubscriptions = subscriptionPlans.length > 0;
	const isGatewayActive = isPrivateModel
		? true
		: availability?.isGatewayActive ?? true;
	const showProviders =
		modelOverview.status === "Announced" ||
		(availability?.activeProviderCount ?? 0) > 0 ||
		(effectiveGatewayMetadata?.providers.length ?? 0) > 0 ||
		pricingProviders.some((provider) => provider.provider_models.length > 0) ||
		providerPreviews.length > 0;
	const resolvedPerformancePromise = isPrivateModel
		? Promise.resolve(privateModelPerformanceMetrics(modelOverview, privatePerformance))
		: isGatewayActive
		? fetchFrontendModelPerformance(modelId, 24).catch(() => null)
		: Promise.resolve(null);
	const isRetired = modelOverview?.status === "Retired";
	const t = await getTranslations("Catalogue.models.detail.navigation");
	const modelPageTocItems = getModelPageTocItems({
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
										pricingPromise={pricingPromise}
										gatewayMetadataPromise={Promise.resolve(effectiveGatewayMetadata)}
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
		</>
	);
}

export default async function Page({ params }: { params: Promise<ModelRouteParams> }) {
	const routeParams = await params;
	let includeHidden = false;
	const { requestedModelId, canonicalModelId, source } = await resolveModelRouteIds(routeParams, includeHidden);
	const isAliasRoute = isModelAliasRoute({ requestedModelId, canonicalModelId, source });
	if (canonicalModelId !== requestedModelId && !isAliasRoute) {
		permanentRedirect(getModelPath(canonicalModelId));
	}
	const requestedAlias = isAliasRoute ? requestedModelId : undefined;
	const modelId = canonicalModelId;
	if (isFreeRouterModelId(modelId)) {
		const tRouter = await getTranslations("Catalogue.models.freeRouter");
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
	// Start independent section requests alongside the overview so the header can
	// stream as soon as its own data arrives, without serializing the lower body.
	let benchmarkPromise = fetchFrontendModelBenchmarkHighlights(modelId).catch(() => []);
	let subscriptionPromise = fetchFrontendModelSubscriptionPlans(modelId).catch(() => []);
	let availabilityPromise = fetchFrontendModelAvailability(modelId).catch(() => undefined);
	const pricingAbortController = new AbortController();
	let pricingPromise = fetchFrontendModelPricing(modelId, pricingAbortController.signal).catch(() => []);
	let gatewayMetadataPromise = fetchFrontendModelGatewayMetadata(modelId).catch(() => null);
	const providerPreviewsPromise = fetchServerProviderCatalogPreviewsForModel(modelId).catch(() => []);
	let modelOverview = await fetchFrontendModelOverview(modelId)
		.then(async (model) => model ?? await fetchPrivateModelOverview(modelId))
		.catch(() => fetchPrivateModelOverview(modelId));
	if (!modelOverview) {
		const providerPreview = (await providerPreviewsPromise)[0] ?? null;
		if (providerPreview) return <ProviderCatalogPreviewDetail preview={providerPreview} />;
		if (!(await isAdminViewer().catch(() => false))) notFound();
		const source = await fetchAdminModelSource(requestedModelId).catch(() => null);
		modelOverview = source ? toAdminModelOverview(source) : null;
		if (!modelOverview) notFound();
		includeHidden = true;
		benchmarkPromise = fetchFrontendModelBenchmarkHighlights(modelId, true).catch(() => []);
		subscriptionPromise = fetchFrontendModelSubscriptionPlans(modelId, true).catch(() => []);
		availabilityPromise = fetchFrontendModelAvailability(modelId, true).catch(() => undefined);
		pricingPromise = fetchFrontendModelPricing(modelId, pricingAbortController.signal, true).catch(() => []);
		gatewayMetadataPromise = fetchFrontendModelGatewayMetadata(modelId, true).catch(() => null);
	}
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
		<ModelDetailShell modelId={modelId} tab="overview" includeHidden={includeHidden} header={modelHeader} modelOverview={modelOverview} requestedAlias={requestedAlias} canChat={includeHidden ? false : undefined} canCompare={!includeHidden}>
			<Suspense fallback={<ModelOverviewSectionsSkeleton />}>
				<ModelDetailPageBody
					modelId={modelId}
					routeParams={routeParams}
					prefetchedOverview={modelOverview}
					includeHidden={includeHidden}
					benchmarkPromise={benchmarkPromise}
					subscriptionPromise={subscriptionPromise}
					availabilityPromise={availabilityPromise}
					pricingPromise={pricingPromise}
					gatewayMetadataPromise={gatewayMetadataPromise}
					providerPreviewsPromise={providerPreviewsPromise}
					abortPricing={() => pricingAbortController.abort()}
				/>
			</Suspense>
		</ModelDetailShell>
	);
}
