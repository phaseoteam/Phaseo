export type NormalizedProviderErrorCode =
	| "provider_payment_required"
	| "provider_request_rejected"
	| "provider_feature_unsupported"
	| "provider_capacity_exhausted"
	| "provider_service_unavailable";

/** A provider executor's safe interpretation of a failed upstream response. */
export type ProviderErrorIR = {
	code: NormalizedProviderErrorCode;
	message?: string;
	action?: string;
	helpUrl?: string;
};
