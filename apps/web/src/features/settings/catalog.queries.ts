// Public catalogue data the Settings pages read (fetchPublicWebApi; runs on
// the server and in the browser).
import { queryOptions } from "@tanstack/react-query";
import {
	fetchFrontendAPIProviderHeader,
	fetchFrontendAPIProviderModels,
	fetchFrontendAPIProviders,
	fetchFrontendModels,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { fetchPresetModels } from "./presets/presetModels";

export const settingsApiProvidersQuery = () =>
	queryOptions({
		queryKey: ["settings-catalog", "api-providers"],
		queryFn: () => fetchFrontendAPIProviders(),
	});

export const settingsApiProviderHeaderQuery = (providerId: string) =>
	queryOptions({
		queryKey: ["settings-catalog", "api-provider-header", providerId],
		queryFn: () => fetchFrontendAPIProviderHeader(providerId),
	});

export const settingsApiProviderModelsQuery = (providerId: string) =>
	queryOptions({
		queryKey: ["settings-catalog", "api-provider-models", providerId],
		queryFn: () => fetchFrontendAPIProviderModels(providerId),
	});

export const settingsPresetModelsQuery = () =>
	queryOptions({
		queryKey: ["settings-catalog", "preset-models"],
		queryFn: () => fetchPresetModels(),
	});

/** Private-model editors only use model and provider IDs and names; failures fall back to empty lists. */
export const settingsPrivateModelCatalogQuery = () =>
	queryOptions({
		queryKey: ["settings-catalog", "private-model-catalog"],
		queryFn: async () => {
			// Only model IDs and names are used, so skip the gateway enrichment.
			const [models, providers] = await Promise.all([fetchFrontendModels({ includeGatewayData: false }).catch(() => []),fetchFrontendAPIProviders().catch(() => [])]);
			return {
				catalogModels: models.map((item) => ({ id: item.model_id, name: item.name })),
				providers: providers.map((item) => ({ id: item.api_provider_id, name: item.api_provider_name })),
			};
		},
	});
