// Server-only work for the model detail page: route resolution (canonical id,
// private models, provider previews, the admin fallback for hidden models) and
// the includeHidden variants of the section fetchers, which read admin sources.
import { createServerFn } from "@tanstack/react-start";
import type { ModelOverviewPage } from "@/lib/fetchers/models/getModel";
import type { AuthenticatedProviderCatalogPreview } from "@/lib/query/providerCatalogPreviews";

export type ModelPageRouteInput = { organisationId: string; modelId: string };

export type ModelPageResolution =
	| { kind: "redirect"; to: string }
	| { kind: "not-found" }
	| { kind: "free-router"; modelId: string; requestedAlias?: string }
	| { kind: "preview"; preview: AuthenticatedProviderCatalogPreview }
	| {
			kind: "model";
			modelId: string;
			requestedAlias?: string;
			includeHidden: boolean;
			canChatInternal: boolean;
			modelOverview: ModelOverviewPage;
	  };

export const resolveModelPage = createServerFn({ method: "GET" })
	.validator((input: ModelPageRouteInput) => input)
	.handler(async ({ data: routeParams }): Promise<ModelPageResolution> => {
		const [
			{ getModelPath, isModelAliasRoute, resolveModelRouteIds },
			{ isFreeRouterModelId },
			{ fetchFrontendModelOverview },
			{ fetchPrivateModelOverview },
			{ fetchServerProviderCatalogPreviewsForModel },
		] = await Promise.all([
			import("@/components/(data)/model/model-route-helpers"),
			import("@/lib/models/freeRouter"),
			import("@/lib/fetchers/frontend/fetchPublicCatalog"),
			import("@/lib/fetchers/internal/fetchSettingsPrivateModels"),
			import("@/lib/fetchers/internal/fetchServerProviderCatalogPreviews"),
		]);
		const { requestedModelId, canonicalModelId, source } = await resolveModelRouteIds(routeParams, false);
		const isAliasRoute = isModelAliasRoute({ requestedModelId, canonicalModelId, source });
		if (canonicalModelId !== requestedModelId && !isAliasRoute) {
			return { kind: "redirect", to: getModelPath(canonicalModelId) };
		}
		const requestedAlias = isAliasRoute ? requestedModelId : undefined;
		const modelId = canonicalModelId;
		if (isFreeRouterModelId(modelId)) return { kind: "free-router", modelId, requestedAlias };
		let modelOverview = await fetchFrontendModelOverview(modelId)
			.then(async (model) => model ?? await fetchPrivateModelOverview(modelId))
			.catch(() => fetchPrivateModelOverview(modelId));
		if (modelOverview) {
			return { kind: "model", modelId, requestedAlias, includeHidden: false, canChatInternal: false, modelOverview };
		}
		const providerPreview = (await fetchServerProviderCatalogPreviewsForModel(modelId).catch(() => []))[0] ?? null;
		if (providerPreview) return { kind: "preview", preview: providerPreview };
		const [{ isAdminViewer }, { fetchAdminModelSource }, { toAdminModelOverview }, { adminSourceToChatModels }] = await Promise.all([
			import("@/lib/auth/getViewerRole"),
			import("@/lib/fetchers/internal/fetchAdminModelSource"),
			import("@/lib/models/adminModelOverview"),
			import("@/lib/chat/adminInternalModels"),
		]);
		if (!(await isAdminViewer().catch(() => false))) return { kind: "not-found" };
		const adminSource = await fetchAdminModelSource(requestedModelId).catch(() => null);
		modelOverview = adminSource ? toAdminModelOverview(adminSource) : null;
		if (!modelOverview) return { kind: "not-found" };
		return {
			kind: "model",
			modelId,
			requestedAlias,
			includeHidden: true,
			canChatInternal: adminSource ? adminSourceToChatModels(adminSource).length > 0 : false,
			modelOverview,
		};
	});

export const getModelProviderPreviews = createServerFn({ method: "GET" })
	.validator((modelId: string) => modelId)
	.handler(async ({ data: modelId }) => {
		const { fetchServerProviderCatalogPreviewsForModel } = await import("@/lib/fetchers/internal/fetchServerProviderCatalogPreviews");
		return fetchServerProviderCatalogPreviewsForModel(modelId).catch(() => []);
	});

export const getPrivateModelPerformance = createServerFn({ method: "GET" })
	.validator((modelId: string) => modelId)
	.handler(async ({ data: modelId }) => {
		const { fetchPrivateModelPerformance } = await import("@/lib/fetchers/internal/fetchSettingsPrivateModels");
		return fetchPrivateModelPerformance(modelId);
	});

/** includeHidden variants read admin model sources, so they run on the server. */
export const getHiddenModelSections = createServerFn({ method: "GET" })
	.validator((input: { modelId: string; section: "benchmarks" | "subscriptions" | "availability" | "pricing" | "gateway-metadata" }) => input)
	.handler(async ({ data: { modelId, section } }) => {
		const catalog = await import("@/lib/fetchers/frontend/fetchPublicCatalog");
		switch (section) {
			case "benchmarks":
				return catalog.fetchFrontendModelBenchmarkHighlights(modelId, true).catch(() => []);
			case "subscriptions":
				return catalog.fetchFrontendModelSubscriptionPlans(modelId, true).catch(() => []);
			case "availability":
				return catalog.fetchFrontendModelAvailability(modelId, true).catch(() => null);
			case "pricing":
				return catalog.fetchFrontendModelPricing(modelId, undefined, true).catch(() => []);
			case "gateway-metadata":
				return catalog.fetchFrontendModelGatewayMetadata(modelId, true).catch(() => null);
		}
	});
