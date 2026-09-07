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
	isModelAliasRoute,
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
import { withOptionalProviderVisibilityTimeout } from "./providerVisibilityTimeout";
import { fetchPrivateModelOverview, fetchPrivateModelPerformance } from "@/lib/fetchers/internal/fetchSettingsPrivateModels";
import type { ModelGatewayMetadata } from "@/lib/fetchers/models/getModelGatewayMetadata";
import type { ModelPerformanceMetrics } from "@/lib/fetchers/models/getModelPerformance";
import type { ProviderPricing } from "@/lib/fetchers/models/getModelPricing";
import { resolveProviderDisplayName } from "@/lib/providers/providerOffers";

const MODEL_PROVIDER_VISIBILITY_TIMEOUT_MS = 1_000;

function privateModelGatewayMetadata(model: ModelOverviewPage): ModelGatewayMetadata {
	const provider = {
		id: `private-model:${model.model_id}:chat.completions`, api_provider_id: "private-model",
		model_id: model.model_id, endpoint: "chat.completions", is_active_gateway: true,
		availability_status: "active" as const, availability_reason: "active" as const,
		provider_availability_status: "available" as const, phaseo_status: "enabled" as const,
		access_scope: null, input_modalities: "text", output_modalities: "text",
		provider: { api_provider_id: "private-model", api_provider_name: "Private endpoint" },
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

function privateModelProviders(model: ModelOverviewPage): ProviderPricing[] {
	const providerId = String(model.model_details.find((detail) => detail.detail_name === "hosting provider")?.detail_value ?? "private-model");
	const effectiveFrom = new Date(0).toISOString(); const modelKey = `${providerId}:${model.model_id}:chat.completions`;
	const rule = (meter: string) => ({ id: `private-${meter}`, model_key: modelKey, pricing_plan: "standard", meter, unit: "token", unit_size: 1, price_per_unit: 0, currency: "USD", note: "Upstream billing is managed directly by the workspace.", match: [], priority: 100, effective_from: effectiveFrom, effective_to: null });
	return [{ provider: { api_provider_id: providerId, api_provider_name: providerId, offer_label: "Private deployment", offer_scope: "specialized", status: "active", routing_status: "active" }, provider_models: [{ id: `private-model:${model.model_id}`, api_provider_id: providerId, provider_model_slug: model.model_id, model_id: model.model_id, endpoint: "chat.completions", capability_status: "active", routing_status: "active", provider_availability_status: "available", phaseo_status: "enabled", access_scope: null, is_active_gateway: true, input_modalities: "text", output_modalities: "text" }], pricing_rules: [rule("input_tokens"), rule("output_tokens")] }];
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
		/>
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
	{ id: "verification", label: "Verification" },
	{ id: "about", label: "About" },
	{ id: "subscriptions", label: "Subscriptions" },
	{ id: "faq", label: "FAQ" },
];

function getModelPageTocItems({
	showBenchmarks,
	showSubscriptions,
	status,
	isGatewayActive,
	showProviders,
	showVerification,
	isPrivateModel = false,
}: {
	showBenchmarks: boolean;
	showSubscriptions: boolean;
	status?: string | null;
	isGatewayActive: boolean;
	showProviders: boolean;
	showVerification: boolean;
	isPrivateModel?: boolean;
}): ModelPageTocItem[] {
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
	const model = await fetchFrontendModelOverview(modelId).catch(() => null)
		?? await fetchPrivateModelOverview(modelId).catch(() => null);
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
	return buildMetadata({
		title: buildModelOverviewMetadataTitle(modelName, {
			providerCount,
			benchmarkCount: benchmarks.length,
			hasPricing: pricing.length > 0,
			contextLength: gatewayMetadata?.providers
				.map((entry) => entry.context_length ?? 0)
				.filter((value) => value > 0)
				.sort((left, right) => right - left)[0],
		}),
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
	const { requestedModelId, canonicalModelId, source } = await resolveModelRouteIds(
		routeParams,
		includeHidden,
	);
	const isAliasRoute = isModelAliasRoute({ requestedModelId, canonicalModelId, source });
	if (canonicalModelId !== requestedModelId && !isAliasRoute) {
		permanentRedirect(getModelPath(canonicalModelId));
	}
	const requestedAlias = isAliasRoute ? requestedModelId : undefined;
	const modelId = canonicalModelId;
	if (isFreeRouterModelId(modelId)) {
		return (
			<ModelDetailShell modelId={modelId} tab="overview" includeHidden={includeHidden} requestedAlias={requestedAlias}>
				<FreeRouterOverview />
			</ModelDetailShell>
		);
	}
	const modelPromise = fetchFrontendModelOverview(modelId)
		.then(async (model) => model ?? await fetchPrivateModelOverview(modelId))
		.catch(() => fetchPrivateModelOverview(modelId));
	const benchmarkPromise = fetchFrontendModelBenchmarkHighlights(modelId).catch(() => []);
	const subscriptionPromise = fetchFrontendModelSubscriptionPlans(modelId).catch(() => []);
	const availabilityPromise = fetchFrontendModelAvailability(modelId).catch(() => undefined);
	const pricingAbortController = new AbortController();
	const pricingPromise = fetchFrontendModelPricing(
		modelId,
		pricingAbortController.signal,
	).catch(() => []);
	const gatewayMetadataPromise = fetchFrontendModelGatewayMetadata(modelId).catch(
		() => null,
	);
	const gatewayMetadataForVisibilityPromise = withOptionalProviderVisibilityTimeout(
		gatewayMetadataPromise,
		null,
		MODEL_PROVIDER_VISIBILITY_TIMEOUT_MS,
	);
	const pricingForVisibilityPromise = withOptionalProviderVisibilityTimeout(
		pricingPromise,
		[],
		MODEL_PROVIDER_VISIBILITY_TIMEOUT_MS,
		() => pricingAbortController.abort(),
	);
	const [modelOverview, benchmarkHighlights, subscriptionPlans, availability, gatewayMetadata, pricingProviders] =
		await Promise.all([
			modelPromise,
			benchmarkPromise,
			subscriptionPromise,
			availabilityPromise,
			gatewayMetadataForVisibilityPromise,
			pricingForVisibilityPromise,
		]);
	if (!modelOverview) notFound();
	const isPrivateModel = modelOverview.is_private === true;
	const effectiveGatewayMetadata = isPrivateModel ? privateModelGatewayMetadata(modelOverview) : gatewayMetadata;
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
		pricingProviders.some((provider) => provider.provider_models.length > 0);
	const resolvedPerformancePromise = isPrivateModel
		? Promise.resolve(privateModelPerformanceMetrics(modelOverview, privatePerformance))
		: isGatewayActive
		? fetchFrontendModelPerformance(modelId, 24).catch(() => null)
		: Promise.resolve(null);
	const isRetired = modelOverview?.status === "Retired";
	const modelPageTocItems = getModelPageTocItems({
		showBenchmarks,
		showSubscriptions,
		status: modelOverview?.status,
		isGatewayActive,
		showProviders,
		showVerification: supportsProvenanceVerification(modelOverview.output_types),
		isPrivateModel,
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
			logo_url: modelOverview.organisation.logo_url ?? null,
		},
		aliases: modelOverview.aliases ?? [],
		family_id: modelOverview.family_id ?? undefined,
		status: modelOverview.status,
		hidden: false,
		is_private: isPrivateModel,
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
			<ModelDetailShell modelId={modelId} tab="overview" includeHidden={includeHidden} header={modelHeader} modelOverview={modelOverview} requestedAlias={requestedAlias}>
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
								privateProviders={isPrivateModel ? privateModelProviders(modelOverview) : undefined}
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
			</ModelDetailShell>
		</>
	);
}
