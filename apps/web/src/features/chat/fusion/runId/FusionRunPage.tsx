import { Suspense } from "react";
import { useParams } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { getTranslations } from "@/i18n/server";
import CouncilClient from "@/components/(experiments)/CouncilClient";
import { chatCouncilModelsQuery } from "../../chat.queries";
import { buildDefaultCouncilPresets } from "@/lib/experiments/councilPresets";

export async function getFusionRunMetadata(): Promise<PageMetadata> {
	const t = await getTranslations("Product.chat");
	return { title: t("fusion"), description: t("fusionDescription") };
}

export default function FusionRunPage() {
	return (
		<Suspense fallback={<div className="flex min-h-0 flex-1 animate-pulse bg-muted/20" />}>
			<FusionRunPageContent />
		</Suspense>
	);
}

function FusionRunPageContent() {
	const { runId } = useParams({ from: "/{-$locale}/_dashboard/chat/fusion/$runId/" });
	const parsedRunId = Number.parseInt(runId, 10);
	const { data: models } = useSuspenseQuery(chatCouncilModelsQuery());
	const initialPresets = buildDefaultCouncilPresets(models.map((model) => model.modelId));
	return (
		<CouncilClient
			models={models}
			initialPresets={initialPresets}
			initialSelectedRunId={Number.isFinite(parsedRunId) ? parsedRunId : null}
			routeBasePath="/chat/fusion"
		/>
	);
}
