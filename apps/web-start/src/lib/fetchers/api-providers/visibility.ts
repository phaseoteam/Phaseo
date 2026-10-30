const HIDDEN_API_PROVIDER_IDS = new Set(["inception", "inceptron", "nextbit"]);

export function isAPIProviderHidden(apiProviderId: string): boolean {
	return HIDDEN_API_PROVIDER_IDS.has(apiProviderId.toLowerCase());
}

export function filterVisibleAPIProviders<T extends { api_provider_id: string }>(
	providers: T[]
): T[] {
	return providers.filter(
		(provider) => !isAPIProviderHidden(provider.api_provider_id)
	);
}
