import type { IRVideoGenerationRequest } from "@core/ir";

/** Select extensions after routing, so another provider's options cannot leak. */
export function selectVideoProviderOptions(
	ir: IRVideoGenerationRequest,
	providerId: string,
): IRVideoGenerationRequest {
	if (!ir.providerOptions) return ir;
	const providerParams = ir.providerOptions[providerId] ?? {};
	const rawRequest = { ...ir.rawRequest, provider_params: providerParams };
	delete rawRequest.provider_options;
	return {
		...ir,
		providerParams,
		rawRequest,
		outputStorageUri: typeof providerParams.storageUri === "string"
			? providerParams.storageUri
			: typeof providerParams.outputStorageUri === "string" ? providerParams.outputStorageUri : undefined,
	};
}
