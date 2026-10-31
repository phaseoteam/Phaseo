// Server-only model data for the catalogue model components. Hidden-model
// reads (`includeHidden`) go through the signed-in admin's model source, and
// the Epoch interval CSV is fetched server-side only (server-only code,
// no browser CORS), so these run in server functions.
import { createServerFn } from "@tanstack/react-start";

const modelIdInput = (modelId: string) => modelId;

export const getHiddenModelHeader = createServerFn({ method: "GET" })
	.validator(modelIdInput)
	.handler(async ({ data: modelId }) => {
		const { fetchFrontendModelHeader } = await import("@/lib/fetchers/frontend/fetchPublicCatalog");
		return fetchFrontendModelHeader(modelId, true);
	});

export const getHiddenModelPricing = createServerFn({ method: "GET", strict: { output: false } })
	.validator(modelIdInput)
	.handler(async ({ data: modelId }) => {
		const { fetchFrontendModelPricing } = await import("@/lib/fetchers/frontend/fetchPublicCatalog");
		return fetchFrontendModelPricing(modelId, undefined, true);
	});

export const getHiddenModelSubscriptionPlans = createServerFn({ method: "GET" })
	.validator(modelIdInput)
	.handler(async ({ data: modelId }) => {
		const { fetchFrontendModelSubscriptionPlans } = await import("@/lib/fetchers/frontend/fetchPublicCatalog");
		return fetchFrontendModelSubscriptionPlans(modelId, true);
	});

export const getHiddenModelPendingApiReleaseState = createServerFn({ method: "GET" })
	.validator(modelIdInput)
	.handler(async ({ data: modelId }) => {
		const { fetchFrontendModelPendingApiReleaseState } = await import("@/lib/fetchers/frontend/fetchPublicCatalog");
		return fetchFrontendModelPendingApiReleaseState(modelId, true);
	});

export const getHiddenModelBenchmarkHighlights = createServerFn({ method: "GET" })
	.validator(modelIdInput)
	.handler(async ({ data: modelId }) => {
		const { fetchFrontendModelBenchmarkHighlights } = await import("@/lib/fetchers/frontend/fetchPublicCatalog");
		return fetchFrontendModelBenchmarkHighlights(modelId, true);
	});

export const getHiddenModelBenchmarkResults = createServerFn({ method: "GET" })
	.validator(modelIdInput)
	.handler(async ({ data: modelId }) => {
		const { fetchFrontendModelBenchmarkResults } = await import("@/lib/fetchers/frontend/fetchPublicCatalog");
		return fetchFrontendModelBenchmarkResults(modelId, true);
	});

/**
 * Quickstart metadata for hidden models: admins get the internal gateway
 * metadata, everyone else the public metadata (as ModelQuickstartSection did).
 */
export const getHiddenModelQuickstartGatewayMetadata = createServerFn({ method: "GET" })
	.validator(modelIdInput)
	.handler(async ({ data: modelId }) => {
		const [{ isAdminViewer }, { getModelGatewayMetadataCached }, { fetchFrontendModelGatewayMetadata }] = await Promise.all([
			import("@/lib/auth/getViewerRole"),
			import("@/lib/fetchers/models/getModelGatewayMetadata"),
			import("@/lib/fetchers/frontend/fetchPublicCatalog"),
		]);
		const includeInternalProviders = await isAdminViewer().catch(() => false);
		return includeInternalProviders
			? getModelGatewayMetadataCached(modelId, true)
			: fetchFrontendModelGatewayMetadata(modelId);
	});

export const getEpochConfidenceIntervals = createServerFn({ method: "GET" }).handler(async () => {
	const { fetchEpochConfidenceIntervals } = await import("@/lib/benchmarks/epochData");
	return fetchEpochConfidenceIntervals();
});
