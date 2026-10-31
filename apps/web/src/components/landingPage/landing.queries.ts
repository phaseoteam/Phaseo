// Public landing-page data. These fetchers call the public web API, so the
// queries run during SSR and in the browser alike. Where a section swallowed
// fetch errors in Next, the queryFn does the same so the section keeps its
// fallback instead of throwing.
import { queryOptions } from "@tanstack/react-query";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import {
	fetchFrontendAPIProviders,
	fetchFrontendGatewayShowcase,
	fetchFrontendLandingStats,
	fetchFrontendModelUpdateCards,
	fetchFrontendSignInMainModels,
	fetchFrontendSignInSupportedModelsStats,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";
import type { SignInModel } from "@/lib/fetchers/landing/sign-in/types";

export const landingStatsQuery = () =>
	queryOptions({
		queryKey: ["landing", "stats"],
		queryFn: () => fetchFrontendLandingStats(),
	});

export const landingSupportedModelsStatsQuery = () =>
	queryOptions({
		queryKey: ["landing", "supported-models-stats"],
		queryFn: () => fetchFrontendSignInSupportedModelsStats(),
	});

/** Same stats, `null` when the fetch failed. */
export const landingSupportedModelsStatsOrNullQuery = () =>
	queryOptions({
		queryKey: ["landing", "supported-models-stats", "or-null"],
		queryFn: () => fetchFrontendSignInSupportedModelsStats().catch(() => null),
	});

/** Main models by id; an empty list when the fetch failed. */
export const landingMainModelsQuery = (modelIds: readonly string[]) =>
	queryOptions({
		queryKey: ["landing", "main-models", modelIds],
		queryFn: async (): Promise<SignInModel[]> => {
			try {
				return await fetchFrontendSignInMainModels([...modelIds]);
			} catch {
				return [];
			}
		},
	});

export const landingGatewayShowcaseQuery = (args: { topAppsLimit: number; topModelsLimit: number }) =>
	queryOptions({
		queryKey: ["landing", "gateway-showcase", args.topAppsLimit, args.topModelsLimit],
		queryFn: () => fetchFrontendGatewayShowcase(args),
	});

export const landingModelUpdateCardsQuery = (limit: number) =>
	queryOptions({
		queryKey: ["landing", "model-update-cards", limit],
		queryFn: () => fetchFrontendModelUpdateCards(limit, false),
	});

/** API providers; an empty list when the fetch failed. */
export const landingApiProvidersQuery = () =>
	queryOptions({
		queryKey: ["landing", "api-providers"],
		queryFn: () => fetchFrontendAPIProviders().catch(() => []),
	});

/** Gateway catalogue for the home gateway section; `null` when the fetch failed. */
export const landingGatewayModelsQuery = () =>
	queryOptions({
		queryKey: ["landing", "gateway-models"],
		queryFn: async () => {
			try {
				return await fetchFrontendGatewayModels();
			} catch (error) {
				console.warn("[HomeGatewaySection] failed to load gateway models", error);
				return null;
			}
		},
	});
