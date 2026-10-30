import { queryOptions } from "@tanstack/react-query";
import {
	fetchFrontendModelAvailability,
	fetchFrontendModelBenchmarkHighlights,
	fetchFrontendModelGatewayMetadata,
	fetchFrontendModelHeader,
	fetchFrontendModelPricing,
	fetchFrontendModelSubscriptionPlans,
	fetchFrontendModelTimeline,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";
import {
	getModelLineageLinks,
	resolveModelLineageNames,
} from "@/components/(data)/model/overview/modelOverviewMetadata";
import { withOptionalProviderVisibilityTimeout } from "@/lib/models/providerVisibilityTimeout";
import {
	getHiddenModelSections,
	getModelProviderPreviews,
	getPrivateModelPerformance,
	resolveModelPage,
	type ModelPageRouteInput,
} from "./page.functions";

const MODEL_PROVIDER_VISIBILITY_TIMEOUT_MS = 1_000;

type Availability = Awaited<ReturnType<typeof fetchFrontendModelAvailability>>;
type GatewayMetadata = Awaited<ReturnType<typeof fetchFrontendModelGatewayMetadata>>;
type Pricing = Awaited<ReturnType<typeof fetchFrontendModelPricing>>;

export const modelPageQuery = (input: ModelPageRouteInput) =>
	queryOptions({
		queryKey: ["model-page", "resolution", input.organisationId, input.modelId],
		queryFn: () => resolveModelPage({ data: { organisationId: input.organisationId, modelId: input.modelId } }),
	});

export const modelPageBenchmarkHighlightsQuery = (modelId: string, includeHidden: boolean) =>
	queryOptions({
		queryKey: ["model-page", "benchmark-highlights", modelId, includeHidden],
		queryFn: async () =>
			includeHidden
				? ((await getHiddenModelSections({ data: { modelId, section: "benchmarks" } })) as Awaited<ReturnType<typeof fetchFrontendModelBenchmarkHighlights>>)
				: fetchFrontendModelBenchmarkHighlights(modelId).catch(() => []),
	});

export const modelPageSubscriptionPlansQuery = (modelId: string, includeHidden: boolean) =>
	queryOptions({
		queryKey: ["model-page", "subscription-plans", modelId, includeHidden],
		queryFn: async () =>
			includeHidden
				? ((await getHiddenModelSections({ data: { modelId, section: "subscriptions" } })) as Awaited<ReturnType<typeof fetchFrontendModelSubscriptionPlans>>)
				: fetchFrontendModelSubscriptionPlans(modelId).catch(() => []),
	});

export const modelPageAvailabilityQuery = (modelId: string, includeHidden: boolean) =>
	queryOptions({
		queryKey: ["model-page", "availability", modelId, includeHidden],
		queryFn: async (): Promise<Availability | null> =>
			includeHidden
				? ((await getHiddenModelSections({ data: { modelId, section: "availability" } })) as Availability | null)
				: fetchFrontendModelAvailability(modelId).catch(() => null),
	});

function fetchPricing(modelId: string, includeHidden: boolean, signal?: AbortSignal): Promise<Pricing> {
	return includeHidden
		? (getHiddenModelSections({ data: { modelId, section: "pricing" } }) as Promise<Pricing>)
		: fetchFrontendModelPricing(modelId, signal).catch(() => []);
}

function fetchGatewayMetadata(modelId: string, includeHidden: boolean): Promise<GatewayMetadata | null> {
	return includeHidden
		? (getHiddenModelSections({ data: { modelId, section: "gateway-metadata" } }) as Promise<GatewayMetadata | null>)
		: fetchFrontendModelGatewayMetadata(modelId).catch(() => null);
}

export const modelPagePricingQuery = (modelId: string, includeHidden: boolean) =>
	queryOptions({
		queryKey: ["model-page", "pricing", modelId, includeHidden],
		queryFn: () => fetchPricing(modelId, includeHidden),
	});

export const modelPageGatewayMetadataQuery = (modelId: string, includeHidden: boolean) =>
	queryOptions({
		queryKey: ["model-page", "gateway-metadata", modelId, includeHidden],
		queryFn: () => fetchGatewayMetadata(modelId, includeHidden),
	});

/** Provider visibility must not wait on slow pricing / metadata: fall back after 1s. */
export const modelPagePricingForVisibilityQuery = (modelId: string, includeHidden: boolean) =>
	queryOptions({
		queryKey: ["model-page", "pricing-visibility", modelId, includeHidden],
		queryFn: () => {
			const controller = new AbortController();
			return withOptionalProviderVisibilityTimeout(
				fetchPricing(modelId, includeHidden, controller.signal),
				[] as Pricing,
				MODEL_PROVIDER_VISIBILITY_TIMEOUT_MS,
				() => controller.abort(),
			);
		},
	});

export const modelPageGatewayMetadataForVisibilityQuery = (modelId: string, includeHidden: boolean) =>
	queryOptions({
		queryKey: ["model-page", "gateway-metadata-visibility", modelId, includeHidden],
		queryFn: () =>
			withOptionalProviderVisibilityTimeout(
				fetchGatewayMetadata(modelId, includeHidden),
				null,
				MODEL_PROVIDER_VISIBILITY_TIMEOUT_MS,
			),
	});

export const modelPageProviderPreviewsQuery = (modelId: string) =>
	queryOptions({
		queryKey: ["model-page", "provider-previews", modelId],
		queryFn: () => getModelProviderPreviews({ data: modelId }),
	});

export const modelPagePrivatePerformanceQuery = (modelId: string, isPrivateModel: boolean) =>
	queryOptions({
		queryKey: ["model-page", "private-performance", modelId, isPrivateModel],
		queryFn: () => (isPrivateModel ? getPrivateModelPerformance({ data: modelId }) : Promise.resolve(null)),
	});

export const modelPageFaqRelatedModelsQuery = (modelId: string, previousModelId: string | null | undefined) =>
	queryOptions({
		queryKey: ["model-page", "faq-related-models", modelId, previousModelId ?? null],
		queryFn: async () => {
			const timeline = await fetchFrontendModelTimeline(modelId).catch(() => null);
			return resolveModelLineageNames(
				getModelLineageLinks(timeline?.events, previousModelId),
				async (relatedModelId) =>
					(
						await fetchFrontendModelHeader(relatedModelId).catch(() => null)
					)?.name,
			);
		},
	});

/** Section data the body needs; the loader starts these alongside route resolution. */
export function modelPageBodyQueries(modelId: string, includeHidden: boolean) {
	return [
		modelPageBenchmarkHighlightsQuery(modelId, includeHidden),
		modelPageSubscriptionPlansQuery(modelId, includeHidden),
		modelPageAvailabilityQuery(modelId, includeHidden),
		modelPageGatewayMetadataForVisibilityQuery(modelId, includeHidden),
		modelPagePricingForVisibilityQuery(modelId, includeHidden),
		modelPageProviderPreviewsQuery(modelId),
	] as const;
}
