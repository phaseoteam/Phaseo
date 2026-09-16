import type { AuthenticatedProviderCatalogPreview } from "@/lib/swr/providerCatalogPreviews";
import type { ModelOverviewHeader } from "@/lib/fetchers/models/getModelOverviewHeader";
import ModelDetailShell from "./ModelDetailShell";
import ProviderCatalogPreviewContent, {
	PreviewStatusBanner,
} from "./ProviderCatalogPreviewDetailContent";

export default function ProviderCatalogPreviewDetail({
	preview,
}: {
	preview: AuthenticatedProviderCatalogPreview;
}) {
	const header: ModelOverviewHeader = {
		model_id: preview.model_id,
		name: preview.model_name,
		organisation_id: preview.provider_slug,
		organisation: {
			name: preview.provider_name,
			country_code: "",
		},
		aliases: [],
		status: preview.availability_reason === "retired" ? "Retired" : "Announced",
		hidden: false,
	};

	return (
		<ModelDetailShell
			modelId={preview.model_id}
			tab="overview"
			header={header}
			modelOverview={null}
			canChat={false}
			canCompare={false}
			organisationHref={`/api-providers/${encodeURIComponent(preview.provider_slug)}`}
			descriptionOverride={preview.description}
			statusBanner={<PreviewStatusBanner preview={preview} />}
			showUnreleased
		>
			<ProviderCatalogPreviewContent preview={preview} />
		</ModelDetailShell>
	);
}
