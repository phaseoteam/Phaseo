import type { AuthenticatedProviderCatalogPreview } from "@/lib/swr/providerCatalogPreviews";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";

type ProviderCatalogPreviewResponse = {
	models?: AuthenticatedProviderCatalogPreview[];
};

export async function fetchServerProviderCatalogPreviews(
	providerSlug?: string,
): Promise<AuthenticatedProviderCatalogPreview[]> {
	const { accessToken } = await getServerAccountContext();
	if (!accessToken) return [];

	const query = providerSlug
		? `?providerSlug=${encodeURIComponent(providerSlug)}`
		: "";

	try {
		const payload = await fetchAccountWebApi<ProviderCatalogPreviewResponse>(
			`/api/account/settings/provider-onboarding/catalogue-previews${query}`,
			accessToken,
		);
		return Array.isArray(payload.models) ? payload.models : [];
	} catch {
		return [];
	}
}

export async function fetchServerProviderCatalogPreview(
	modelId: string,
): Promise<AuthenticatedProviderCatalogPreview | null> {
	const previews = await fetchServerProviderCatalogPreviews();
	return previews.find(
		(preview) =>
			preview.model_id === modelId ||
			preview.canonical_model_slug === modelId,
	) ?? null;
}

export async function fetchServerProviderCatalogPreviewsForModel(
	modelId: string,
): Promise<AuthenticatedProviderCatalogPreview[]> {
	const previews = await fetchServerProviderCatalogPreviews();
	return previews.filter(
		(preview) =>
			preview.model_id === modelId ||
			preview.canonical_model_slug === modelId,
	);
}
