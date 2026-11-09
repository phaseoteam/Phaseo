// Public API provider catalogue reads for the provider page building blocks.
// All are public web-API fetchers, so they run on the server and in the browser.
import { queryOptions } from "@tanstack/react-query";
import {
	fetchFrontendAPIProviderAppTokenTimeseries,
	fetchFrontendAPIProviderHeader,
	fetchFrontendAPIProviderMetrics,
	fetchFrontendAPIProviderModelTokenTimeseries,
	fetchFrontendAPIProviderTopApps,
	fetchFrontendAPIProviderTopModels,
	fetchFrontendAPIProviderUpdates,
	fetchFrontendMarketShareTimeseries,
	fetchFrontendProviderNamesByIds,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";

const apiProviderRoot = ["phaseo-web", "catalogue-api-provider"] as const;

/** `fetchFrontendAPIProviderHeader(id)`; failures resolve to null. */
export const apiProviderHeaderQuery = (apiProviderId: string) =>
	queryOptions({
		queryKey: [...apiProviderRoot, "header", apiProviderId] as const,
		queryFn: () => fetchFrontendAPIProviderHeader(apiProviderId).catch(() => null),
	});

export const apiProviderMetricsQuery = (apiProviderId: string, hours: number) =>
	queryOptions({
		queryKey: [...apiProviderRoot, "metrics", apiProviderId, hours] as const,
		queryFn: () => fetchFrontendAPIProviderMetrics(apiProviderId, hours),
	});

export const apiProviderModelTokenTimeseriesQuery = (
	apiProviderId: string,
	options: { days: number; topModels: number },
) =>
	queryOptions({
		queryKey: [...apiProviderRoot, "model-token-timeseries", apiProviderId, options.days, options.topModels] as const,
		queryFn: () => fetchFrontendAPIProviderModelTokenTimeseries(apiProviderId, options),
	});

export const apiProviderAppTokenTimeseriesQuery = (
	apiProviderId: string,
	options: { days: number; topApps: number },
) =>
	queryOptions({
		queryKey: [...apiProviderRoot, "app-token-timeseries", apiProviderId, options.days, options.topApps] as const,
		queryFn: () => fetchFrontendAPIProviderAppTokenTimeseries(apiProviderId, options),
	});

export const apiProviderTopAppsQuery = (
	apiProviderId: string,
	period: "day" | "week" | "month",
	count: number,
) =>
	queryOptions({
		queryKey: [...apiProviderRoot, "top-apps", apiProviderId, period, count] as const,
		queryFn: () => fetchFrontendAPIProviderTopApps(apiProviderId, period, count),
	});

export const apiProviderTopModelsQuery = (apiProviderId: string, count: number) =>
	queryOptions({
		queryKey: [...apiProviderRoot, "top-models", apiProviderId, count] as const,
		queryFn: () => fetchFrontendAPIProviderTopModels(apiProviderId, count),
	});

export const apiProviderUpdatesQuery = (apiProviderId: string) =>
	queryOptions({
		queryKey: [...apiProviderRoot, "updates", apiProviderId] as const,
		queryFn: () => fetchFrontendAPIProviderUpdates(apiProviderId),
	});

export const providerMarketShareTimeseriesQuery = () =>
	queryOptions({
		queryKey: [...apiProviderRoot, "market-share-timeseries", "provider", "month", "day", 8] as const,
		queryFn: () => fetchFrontendMarketShareTimeseries("provider", "month", "day", 8),
	});

export const providerNamesByIdsQuery = (providerIds: string[]) =>
	queryOptions({
		queryKey: [...apiProviderRoot, "names-by-ids", [...new Set(providerIds)].sort().join("\u001f")] as const,
		queryFn: () => fetchFrontendProviderNamesByIds(providerIds),
	});
