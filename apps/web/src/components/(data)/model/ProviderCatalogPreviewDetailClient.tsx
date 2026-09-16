"use client";

import Link from "next/link";
import useSWR from "swr";
import { Logo } from "@/components/Logo";
import CatalogNotFoundState from "@/components/(data)/CatalogNotFoundState";
import ModelDescriptionPanel from "./ModelDescriptionPanel";
import ModelIdentifierControl from "./ModelIdentifierControl";
import ModelStickyHeader from "./ModelStickyHeader";
import UnreleasedBadge from "./UnreleasedBadge";
import ProviderCatalogPreviewContent, {
	PreviewStatusBanner,
} from "./ProviderCatalogPreviewDetailContent";
import {
	fetchAuthenticatedProviderCatalogPreviews,
	type AuthenticatedProviderCatalogPreview,
} from "@/lib/swr/providerCatalogPreviews";

function PreviewClientFrame({ preview }: { preview: AuthenticatedProviderCatalogPreview }) {
	return (
		<main className="flex flex-col">
			<ModelStickyHeader
				modelId={preview.model_id}
				organisationId={preview.provider_slug}
				organisationName={preview.provider_name}
				modelName={preview.model_name}
				observeId="model-detail-primary-header"
				canChat={false}
				canCompare={false}
				organisationHref={`/api-providers/${encodeURIComponent(preview.provider_slug)}`}
				showUnreleased
			/>
			<div className="container mx-auto px-4 py-8">
				<div
					id="model-detail-primary-header"
					className="mb-5 flex w-full flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"
				>
					<div className="flex w-full items-start gap-4">
						<div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border md:h-16 md:w-16">
							<Logo
								id={preview.provider_slug}
								alt={preview.provider_name}
								className="object-contain"
								fill
							/>
						</div>
						<div className="flex min-w-0 flex-1 flex-col justify-center">
							<div className="flex flex-wrap items-center gap-2">
							<h1 className="text-left text-3xl font-bold leading-tight">
								<Link
									href={`/api-providers/${encodeURIComponent(preview.provider_slug)}`}
									className="underline-offset-4 hover:underline"
								>
									{preview.provider_name}:
								</Link>{" "}
								<span>{preview.model_name}</span>
							</h1>
							<UnreleasedBadge />
							</div>
							<div className="mt-2 flex w-full items-start">
								<ModelIdentifierControl defaultIdentifier={preview.model_id} />
							</div>
						</div>
					</div>
				</div>

				{preview.description ? <ModelDescriptionPanel description={preview.description} /> : null}

				<div className="mt-6">
					<PreviewStatusBanner preview={preview} />
					<ProviderCatalogPreviewContent preview={preview} />
				</div>
			</div>
		</main>
	);
}

export default function ProviderCatalogPreviewDetailClient({
	modelId,
	initialPreview,
}: {
	modelId: string;
	initialPreview?: AuthenticatedProviderCatalogPreview | null;
}) {
	const { data } = useSWR<AuthenticatedProviderCatalogPreview[]>(
		initialPreview ? null : "/api/account/settings/provider-onboarding/catalogue-previews",
		() => fetchAuthenticatedProviderCatalogPreviews(),
	);
	const preview = initialPreview ?? data?.find(
		(item) => item.model_id === modelId || item.canonical_model_slug === modelId,
	);

	if (preview) return <PreviewClientFrame preview={preview} />;
	if (data === undefined && !initialPreview) {
		return (
			<main className="flex flex-1 items-center justify-center px-4 py-24">
				<p className="text-sm text-muted-foreground">Loading model details…</p>
			</main>
		);
	}

	return <CatalogNotFoundState resourceType="model" resourceId={modelId} />;
}
