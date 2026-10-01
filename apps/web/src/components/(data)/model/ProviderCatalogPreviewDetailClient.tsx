"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
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
} from "@/lib/query/providerCatalogPreviews";
import { WEB_QUERY_POLICIES } from "@/lib/query/policies";
import {
	ANONYMOUS_ACCOUNT_QUERY_SCOPE,
	hasAuthenticatedAccountQueryScope,
	webQueryKeys,
	type AccountQueryScope,
} from "@/lib/query/queryKeys";

function PreviewClientFrame({ preview, policyNotice }: { preview: AuthenticatedProviderCatalogPreview; policyNotice?: ReactNode }) {
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
				{policyNotice}
				<PreviewStatusBanner preview={preview} />
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
					<ProviderCatalogPreviewContent preview={preview} />
				</div>
			</div>
		</main>
	);
}

export default function ProviderCatalogPreviewDetailClient({
	modelId,
	initialPreview,
	policyNotice,
	accountQueryScope = ANONYMOUS_ACCOUNT_QUERY_SCOPE,
}: {
	modelId: string;
	initialPreview?: AuthenticatedProviderCatalogPreview | null;
	policyNotice?: ReactNode;
	accountQueryScope?: AccountQueryScope | null;
}) {
	const scope = accountQueryScope ?? ANONYMOUS_ACCOUNT_QUERY_SCOPE;
	const query = useQuery<AuthenticatedProviderCatalogPreview[]>({
		queryKey: webQueryKeys.account.providerPreviews({ scope }),
		queryFn: ({ signal }) =>
			fetchAuthenticatedProviderCatalogPreviews(undefined, true, { signal }),
		...WEB_QUERY_POLICIES.private,
		enabled: hasAuthenticatedAccountQueryScope(scope),
		// A detail seed is not the complete provider-preview list.
		placeholderData: initialPreview ? [initialPreview] : undefined,
	});
	const preview = hasAuthenticatedAccountQueryScope(scope) && query.data?.find(
		(item) => item.model_id === modelId || item.canonical_model_slug === modelId,
	);

	if (preview) return <PreviewClientFrame preview={preview} policyNotice={policyNotice} />;
	if (query.error) {
		return (
			<main className="flex flex-1 items-center justify-center px-4 py-24">
				<p className="text-sm text-muted-foreground">Model details could not be loaded. We’ll retry automatically.</p>
			</main>
		);
	}
	if (query.isPending && query.isFetching && !initialPreview) {
		return (
			<main className="flex flex-1 items-center justify-center px-4 py-24">
				<p className="text-sm text-muted-foreground">Loading model details…</p>
			</main>
		);
	}

	return <CatalogNotFoundState resourceType="model" resourceId={modelId} />;
}
