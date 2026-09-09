import type { ModelGatewayMetadata } from "@/lib/fetchers/models/getModelGatewayMetadata";

export type ByokOnlyProvider = {
	providerId: string;
	providerName: string;
};

export function getByokOnlyProviders(
	metadata: ModelGatewayMetadata | null | undefined,
): ByokOnlyProvider[] {
	if (!metadata?.activeProviders.length) return [];
	if (
		metadata.activeProviders.some(
			(provider) => provider.provider?.credential_mode !== "byok_only",
		)
	) {
		return [];
	}

	return Array.from(
		new Map(
			metadata.activeProviders.map((provider) => {
				const providerId = provider.api_provider_id;
				return [
					providerId,
					{
						providerId,
						providerName:
							provider.provider?.api_provider_name || providerId,
					},
				] as const;
			}),
		).values(),
	);
}
