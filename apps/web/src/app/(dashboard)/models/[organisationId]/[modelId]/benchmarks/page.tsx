import { buildMetadata } from "@/lib/seo";
import ModelDetailShell from "@/components/(data)/model/ModelDetailShell";
import { ModelBenchmarksSection } from "@/components/(data)/model/overview/ModelOverviewSections";
import type { Metadata } from "next";
import {
	getModelPath,
	getModelMetadataIdentity,
	resolveModelRouteIds,
	type ModelRouteParams,
} from "@/components/(data)/model/model-route-helpers";
import { permanentRedirect } from "next/navigation";

export async function generateMetadata(props: {
	params: Promise<ModelRouteParams>;
}): Promise<Metadata> {
	const params = await props.params;
	const { modelId, modelName, organisationName } = await getModelMetadataIdentity(
		params,
		false,
	);
	const path = getModelPath(modelId, "benchmarks");
	const imagePath = `/og/models/${modelId}`;

	return buildMetadata({
		title: `${modelName} Benchmarks - Performance Highlights`,
		description:
			`Explore detailed benchmark scores for ${modelName} on AI Stats and compare performance across industry-standard evaluations, category breakdowns, and historical result updates.`,
		path,
		keywords: [
			modelName,
			`${modelName} benchmarks`,
			organisationName ? `${organisationName} AI` : null,
			"AI model performance",
			"AI model comparisons",
			"AI Stats",
		].filter(Boolean) as string[],
		imagePath,
	});
}

export default async function Page({
	params,
}: {
	params: Promise<ModelRouteParams>;
}) {
	const routeParams = await params;
	const includeHidden = false;
	const { requestedModelId, canonicalModelId } = await resolveModelRouteIds(
		routeParams,
		includeHidden,
	);
	if (canonicalModelId !== requestedModelId) {
		permanentRedirect(getModelPath(canonicalModelId, "benchmarks"));
	}
	const modelId = canonicalModelId;

	return (
		<ModelDetailShell modelId={modelId} tab="benchmarks" includeHidden={includeHidden}>
			<ModelBenchmarksSection modelId={modelId} includeHidden={includeHidden} />
		</ModelDetailShell>
	);
}
