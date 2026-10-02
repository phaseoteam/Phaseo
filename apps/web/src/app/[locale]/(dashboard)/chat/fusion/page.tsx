import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import CouncilClient from "@/components/(experiments)/CouncilClient";
import { fetchExperimentsCouncilModels } from "@/lib/fetchers/frontend/fetchExperimentsCouncilModels";
import { buildDefaultCouncilPresets } from "@/lib/experiments/councilPresets";

export async function generateMetadata(): Promise<Metadata> {
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

async function FusionPageContent() {
	const models = await fetchExperimentsCouncilModels();
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
