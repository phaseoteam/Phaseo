import { getProviderSyncProvider, getProviderSyncProviderIds } from "./provider-sync/providers";
import type { JsonObject } from "./catalogue-sync-shared";

type DiscoveryRow = {
	provider_id: string;
	model_id: string;
	model_details: JsonObject;
	last_seen_at: string;
	source_url?: string;
};

function requestedProviders(): string[] | null {
	const values = process.argv.flatMap((value) => {
		if (!value.startsWith("--provider=") && !value.startsWith("--providers=")) return [];
		return value.split("=", 2)[1]?.split(",") ?? [];
	});
	const providers = [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
	return providers.length > 0 ? providers : null;
}

const PROVIDER_FILTERS = requestedProviders();

export async function fetchLiveDiscoveryRows(): Promise<{ rows: DiscoveryRow[]; errors: string[] }> {
	const providerIds = PROVIDER_FILTERS ?? getProviderSyncProviderIds();
	const providers = providerIds
		.map((providerId) => getProviderSyncProvider(providerId))
		.filter((provider): provider is NonNullable<typeof provider> => provider !== undefined);
	const results = await Promise.all(providers.map(async (provider) => {
		try {
			const accessedAt = new Date().toISOString();
			const payload = await provider.fetchModels();
			return {
				rows: provider.parseModels(payload).map(({ id, details }) => ({
					provider_id: provider.id,
					model_id: id,
					model_details: details,
					last_seen_at: accessedAt,
					source_url: provider.sourceUrl,
				})),
				error: null,
			};
		} catch (error) {
			return {
				rows: [],
				error: `${provider.id}: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}));
	return {
		rows: results.flatMap((result) => result.rows),
		errors: results.flatMap((result) => result.error ? [result.error] : []),
	};
}
