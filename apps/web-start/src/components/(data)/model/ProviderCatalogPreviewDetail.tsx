import type { AuthenticatedProviderCatalogPreview } from "@/lib/query/providerCatalogPreviews";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { toAccountQueryScope } from "@/lib/query/queryKeys";
import ProviderCatalogPreviewDetailClient from "./ProviderCatalogPreviewDetailClient";
import { Suspense } from "react";
import WorkspacePolicyNotice from "../WorkspacePolicyNotice";

export default async function ProviderCatalogPreviewDetail({
	preview,
}: {
	preview: AuthenticatedProviderCatalogPreview;
}) {
	const accountContext = await getServerAccountContext();

	return (
		<ProviderCatalogPreviewDetailClient
			modelId={preview.model_id}
			initialPreview={preview}
			accountQueryScope={toAccountQueryScope(accountContext)}
			policyNotice={<Suspense fallback={null}><WorkspacePolicyNotice kind="model" id={preview.model_id} /></Suspense>}
		/>
	);
}
