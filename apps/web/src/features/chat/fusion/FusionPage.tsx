import { Suspense } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { getTranslations } from "@/i18n/server";
import CouncilClient from "@/components/(experiments)/CouncilClient";
import { chatCouncilModelsQuery } from "@/features/chat/chat.queries";
import { buildDefaultCouncilPresets } from "@/lib/experiments/councilPresets";

export async function getFusionMetadata(): Promise<PageMetadata> {
	const t = await getTranslations("Product.chat");
	return { title: t("fusion"), description: t("fusionDescription"), alternates: { canonical: "/chat/fusion" } };
}

export default function FusionPage() {
	return (
		<Suspense fallback={<div className="flex min-h-0 flex-1 animate-pulse bg-muted/20" />}>
			<FusionPageContent />
		</Suspense>
	);
}

function FusionPageContent() {
	const { data: models } = useSuspenseQuery(chatCouncilModelsQuery());
	const initialPresets = buildDefaultCouncilPresets(models.map((model) => model.modelId));
	return (
		<CouncilClient
			models={models}
			initialPresets={initialPresets}
			initialSelectedRunId={null}
			routeBasePath="/chat/fusion"
		/>
	);
}
