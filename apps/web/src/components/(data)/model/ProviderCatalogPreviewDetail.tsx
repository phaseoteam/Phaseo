import type { AuthenticatedProviderCatalogPreview } from "@/lib/query/providerCatalogPreviews";
import { useSuspenseQuery } from "@tanstack/react-query";
import { catalogueAccountQueryScopeQuery } from "../catalogueViewer.functions";
import ProviderCatalogPreviewDetailClient from "./ProviderCatalogPreviewDetailClient";
import { Suspense } from "react";
import WorkspacePolicyNotice from "../WorkspacePolicyNotice";

export default function ProviderCatalogPreviewDetail({
	preview,
}: {
	preview: AuthenticatedProviderCatalogPreview;
}) {
	const { data: accountQueryScope } = useSuspenseQuery(catalogueAccountQueryScopeQuery());

	return (
		<ProviderCatalogPreviewDetailClient
			modelId={preview.model_id}
			initialPreview={preview}
			accountQueryScope={accountQueryScope}
			policyNotice={<Suspense fallback={null}><WorkspacePolicyNotice kind="model" id={preview.model_id} /></Suspense>}
		/>
	);
}
