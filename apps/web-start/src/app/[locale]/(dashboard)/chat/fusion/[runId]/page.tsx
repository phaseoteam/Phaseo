import { Suspense, use } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import CouncilClient from "@/components/(experiments)/CouncilClient";
import { chatCouncilModelsQuery } from "@/app/[locale]/(dashboard)/chat/chat.queries";
import { buildDefaultCouncilPresets } from "@/lib/experiments/councilPresets";

type FusionRunPageProps = {
	params: Promise<{ runId: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Product.chat");
	return { title: t("fusion"), description: t("fusionDescription") };
}

export default function FusionRunPage({ params }: FusionRunPageProps) {
	return (
		<Suspense fallback={<div className="flex min-h-0 flex-1 animate-pulse bg-muted/20" />}>
			<FusionRunPageContent params={params} />
		</Suspense>
	);
}

function FusionRunPageContent({ params }: FusionRunPageProps) {
	const { runId } = use(params);
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
