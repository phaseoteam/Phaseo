import { WebApiError } from "@/lib/web-api/client";

export type ProviderCatalogPreviewPricing = {
	meterKey: string;
	modality: string;
	direction: string | null;
	unit: string;
	unitQuantity: number;
	priceNanos: number;
	displayLabel: string;
	displayUnit: string;
};

export type ProviderCatalogPreviewTestBlockedReason =
	| "model_not_testable"
	| "provider_endpoint_missing"
	| "provider_adapter_missing"
	| "provider_credentials_missing"
	| "route_not_staged";

export type AuthenticatedProviderCatalogPreview = {
	model_id: string;
	canonical_model_slug?: string | null;
	match_type?: "exact" | "alias" | "new_model" | null;
	pricing?: ProviderCatalogPreviewPricing[];
	api_model_id: string;
	model_name: string;
	provider_model_slug: string;
	provider_slug: string;
	provider_name: string;
	description?: string | null;
	endpoints?: string[] | null;
	supported_params?: string[] | null;
	input_modalities?: string[] | null;
	output_modalities?: string[] | null;
	context_length?: number | null;
	max_output_tokens?: number | null;
	availability_status: "coming_soon" | "not_active";
	availability_reason?: string | null;
	available_from?: string | null;
	deprecated_at?: string | null;
	shutdown_at?: string | null;
	release_date?: string | null;
	announcement_date?: string | null;
	created_at?: string | null;
	is_active_gateway: false;
	decision: "pending" | "approved" | "rejected" | "needs_changes";
	route_projection_status: "not_projected" | "staged" | "probe_passed" | "enabled" | "failed";
	can_test: boolean;
	test_blocked_reason: ProviderCatalogPreviewTestBlockedReason | null;
};

type ProviderCatalogPreviewResponse = {
	models?: AuthenticatedProviderCatalogPreview[];
};

export async function fetchAuthenticatedProviderCatalogPreviews(
	providerSlug?: string,
	throwOnError = false,
): Promise<AuthenticatedProviderCatalogPreview[]> {
	try {
		const query = providerSlug
			? `?providerSlug=${encodeURIComponent(providerSlug)}`
			: "";
		const path = `/api/settings/provider-onboarding/previews${query}`;
		const response = await fetch(path, {
			headers: { Accept: "application/json" },
			credentials: "same-origin",
			cache: "no-store",
		});
		const payload = (await response.json().catch(() => null)) as
			| (ProviderCatalogPreviewResponse & { error?: unknown })
			| null;
		if (!response.ok) {
			throw new WebApiError(
				path,
				response.status,
				typeof payload?.error === "string" ? payload.error : undefined,
			);
		}
		return Array.isArray(payload?.models) ? payload.models : [];
	} catch (error) {
		if (throwOnError) throw error;
		// Signed-out visitors and users without a provider link continue to see
		// the public catalog without an authenticated preview overlay.
		return [];
	}
}
