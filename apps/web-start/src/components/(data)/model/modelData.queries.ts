// Query options for the catalogue model components (model shell, overview
// sections, pricing, quickstart). Public reads call the public web-API
// fetchers directly (they run in both places); hidden-model and server-only
// reads go through ./modelData.functions.
//
// Base queries cache the fetcher result. Sections that used to race a fetch
// against a short timeout keep doing so in their own wrapper query (distinct
// key) that reads the base query through `queryClient.fetchQuery`, so one
// request feeds every consumer and a timed-out fallback is never cached under
// the base key.
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import {
	fetchFrontendModelGatewayMetadata,
	fetchFrontendModelHeader,
	fetchFrontendModelOverview,
	fetchFrontendModelPageNotice,
	fetchFrontendModelPendingApiReleaseState,
	fetchFrontendModelPerformance,
	fetchFrontendModelPricing,
	fetchFrontendModelSubscriptionPlans,
	fetchFrontendModelTimeline,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";
import {
	getHiddenModelHeader,
	getHiddenModelPendingApiReleaseState,
	getHiddenModelPricing,
	getHiddenModelSubscriptionPlans,
} from "./modelData.functions";
import { toQuickstartGatewayMetadata } from "./quickstart/quickstartGatewayMetadata";

export const catalogueModelRoot = ["phaseo-web", "catalogue-model"] as const;

export const OPTIONAL_MODEL_SECTION_TIMEOUT_MS = 2_500;

/** Race a promise against the optional-section timeout; failures and timeouts resolve to `fallback`. */
export function withOptionalTimeout<T>(
	promise: Promise<T>,
	fallback: T,
	label: string,
	logPrefix: string,
): Promise<T> {
	let timeout: ReturnType<typeof setTimeout> | null = null;
	const timeoutPromise = new Promise<T>((resolve) => {
		timeout = setTimeout(() => {
			console.warn(`${logPrefix} ${label} timed out; using fallback.`);
			resolve(fallback);
		}, OPTIONAL_MODEL_SECTION_TIMEOUT_MS);
	});

	return Promise.race([promise, timeoutPromise])
		.catch((error) => {
			console.warn(`${logPrefix} ${label} failed; using fallback.`, error);
			return fallback;
		})
		.finally(() => {
			if (timeout) clearTimeout(timeout);
		});
}

/** `fetchFrontendModelHeader(modelId, includeHidden)`; failures resolve to null. */
export const modelHeaderQuery = (modelId: string, includeHidden = false) =>
	queryOptions({
		queryKey: [...catalogueModelRoot, "header", modelId, includeHidden] as const,
		queryFn: () =>
			(includeHidden
				? getHiddenModelHeader({ data: modelId })
				: fetchFrontendModelHeader(modelId, false)
			).catch(() => null),
	});

/** `fetchFrontendModelOverview(modelId)`; failures resolve to null. */
export const modelOverviewQuery = (modelId: string) =>
	queryOptions({
		queryKey: [...catalogueModelRoot, "overview", modelId] as const,
		queryFn: () => fetchFrontendModelOverview(modelId).catch(() => null),
	});

/**
 * Public `fetchFrontendModelGatewayMetadata(modelId)` trimmed with
 * `toQuickstartGatewayMetadata` (identifiers, supported parameters and each
 * provider's endpoint, credential mode and name). That is everything the model
 * shell, provider pricing and quickstart read, and it keeps the per-provider
 * policy details (tens of KB) out of the hydration payload. Failures resolve
 * to null.
 */
export const modelQuickstartGatewayMetadataQuery = (modelId: string) =>
	queryOptions({
		queryKey: [...catalogueModelRoot, "quickstart-gateway-metadata", modelId] as const,
		queryFn: () =>
			fetchFrontendModelGatewayMetadata(modelId)
				.then(toQuickstartGatewayMetadata)
				.catch(() => null),
	});

/** `fetchFrontendModelSubscriptionPlans(modelId, includeHidden)`; failures resolve to null. */
export const modelSubscriptionPlansQuery = (modelId: string, includeHidden = false) =>
	queryOptions({
		queryKey: [...catalogueModelRoot, "subscription-plans", modelId, includeHidden] as const,
		queryFn: () =>
			(includeHidden
				? getHiddenModelSubscriptionPlans({ data: modelId })
				: fetchFrontendModelSubscriptionPlans(modelId, false)
			).catch(() => null),
	});

/** `fetchFrontendModelPageNotice(modelId, includeHidden)`; failures (and hidden models) resolve to null. */
export const modelPageNoticeQuery = (modelId: string, includeHidden = false) =>
	queryOptions({
		queryKey: [...catalogueModelRoot, "page-notice", modelId, includeHidden] as const,
		queryFn: () => fetchFrontendModelPageNotice(modelId, includeHidden).catch(() => null),
	});

/** Raw `fetchFrontendModelPricing(modelId, undefined, includeHidden)` (errors propagate). */
export const modelPricingQuery = (modelId: string, includeHidden = false) =>
	queryOptions({
		queryKey: [...catalogueModelRoot, "pricing", modelId, includeHidden] as const,
		queryFn: () =>
			includeHidden
				? getHiddenModelPricing({ data: modelId })
				: fetchFrontendModelPricing(modelId, undefined, false),
	});

/** `fetchFrontendModelPerformance(modelId, 24)`; failures resolve to null (as the model page did). */
export const modelPerformanceQuery = (modelId: string) =>
	queryOptions({
		queryKey: [...catalogueModelRoot, "performance", modelId, 24] as const,
		queryFn: () => fetchFrontendModelPerformance(modelId, 24).catch(() => null),
	});

/** Raw `fetchFrontendModelTimeline(modelId)` (errors propagate). */
export const modelTimelineQuery = (modelId: string) =>
	queryOptions({
		queryKey: [...catalogueModelRoot, "timeline", modelId] as const,
		queryFn: () => fetchFrontendModelTimeline(modelId),
	});

/**
 * Pending API release state for the optional sections (performance,
 * benchmarks, pricing insights): every caller raced it against the 2.5 s
 * timeout with a null fallback.
 */
export const modelPendingApiReleaseSectionQuery = (modelId: string, includeHidden = false) =>
	queryOptions({
		queryKey: [...catalogueModelRoot, "section", "pending-api-release", modelId, includeHidden] as const,
		queryFn: () =>
			withOptionalTimeout(
				includeHidden
					? getHiddenModelPendingApiReleaseState({ data: modelId })
					: fetchFrontendModelPendingApiReleaseState(modelId, false),
				null,
				"pending API release state",
				"[ModelOverviewSections]",
			),
	});

/** Stable "now" for a model's pricing render, shared by SSR and hydration. */
export const modelPricingRenderTimeQuery = (modelId: string) =>
	queryOptions({
		queryKey: [...catalogueModelRoot, "pricing-render-time", modelId] as const,
		queryFn: () => Date.now(),
	});

/** Model provider pricing for the pricing insights section (2.5 s timeout, [] fallback). */
export const modelPricingInsightsProvidersQuery = (
	queryClient: QueryClient,
	modelId: string,
	includeHidden = false,
) =>
	queryOptions({
		queryKey: [...catalogueModelRoot, "section", "pricing-insights-providers", modelId, includeHidden] as const,
		queryFn: () =>
			withOptionalTimeout(
				queryClient.fetchQuery(modelPricingQuery(modelId, includeHidden)),
				[],
				"pricing providers",
				"[pricing]",
			),
	});
