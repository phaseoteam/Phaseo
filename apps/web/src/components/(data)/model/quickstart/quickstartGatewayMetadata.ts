import type {
	GatewayProviderModel,
	ModelGatewayMetadata,
} from "@/lib/fetchers/models/getModelGatewayMetadata";

function toQuickstartProvider(provider: GatewayProviderModel): GatewayProviderModel {
	return {
		id: provider.id,
		api_provider_id: provider.api_provider_id,
		model_id: provider.model_id,
		endpoint: provider.endpoint,
		is_active_gateway: provider.is_active_gateway,
		availability_status: provider.availability_status,
		input_modalities: provider.input_modalities,
		output_modalities: provider.output_modalities,
		credential_mode: provider.credential_mode,
		provider: provider.provider
			? {
					api_provider_id: provider.provider.api_provider_id,
					api_provider_name: provider.provider.api_provider_name,
				}
			: null,
	};
}

/**
 * The model header and its "Use this model" sheet only read identifiers,
 * supported parameters, and each provider's endpoint, credential mode and name.
 * The full metadata carries every provider's policy and residency details,
 * which is tens of KB on popular models.
 */
export function toQuickstartGatewayMetadata(
	metadata: ModelGatewayMetadata | null,
): ModelGatewayMetadata | null {
	if (!metadata) return null;
	return {
		modelId: metadata.modelId,
		aliases: metadata.aliases,
		apiModelIds: metadata.apiModelIds,
		primaryModelIdentifier: metadata.primaryModelIdentifier,
		acceptedModelIdentifiers: metadata.acceptedModelIdentifiers,
		primaryModelIdentifierByEndpoint: metadata.primaryModelIdentifierByEndpoint,
		acceptedModelIdentifiersByEndpoint: metadata.acceptedModelIdentifiersByEndpoint,
		supportedParametersByEndpoint: metadata.supportedParametersByEndpoint,
		providers: metadata.providers.map(toQuickstartProvider),
		activeProviders: metadata.activeProviders.map(toQuickstartProvider),
		comingSoonProviders: [],
		inactiveProviders: [],
	};
}
