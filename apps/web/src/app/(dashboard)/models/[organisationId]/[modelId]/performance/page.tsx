import ModelDetailShell from "@/components/(data)/model/ModelDetailShell";
import { ModelPerformanceSection } from "@/components/(data)/model/overview/ModelOverviewSections";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import {
	getModelPath,
	getModelMetadataIdentity,
	resolveModelRouteIds,
	type ModelRouteParams,
} from "@/components/(data)/model/model-route-helpers";
import { buildModelPageMetadataDescription } from "@/lib/models/modelDescription";
import { permanentRedirect } from "next/navigation";

export async function generateMetadata(props: {
	params: Promise<ModelRouteParams>;
}): Promise<Metadata> {
	const params = await props.params;
	const { modelId, modelName, organisationName, modelDescription } = await getModelMetadataIdentity(
		params,
		false,
	);
	const path = getModelPath(modelId, "performance");
	const imagePath = `/og/models/${modelId}`;

	return buildMetadata({
		title: `${modelName} Performance - Latency & Token Trajectory`,
		description: buildModelPageMetadataDescription({
			modelDescription,
			suffix:
				"Track latency trends, throughput signals, reliability movement, and historical usage metrics across recent gateway traffic.",
			fallback: `Track ${modelName} performance on Phaseo with latency trends, throughput signals, reliability movement, and historical usage metrics across recent gateway traffic.`,
		}),
		path,
		keywords: [
			modelName,
			`${modelName} performance`,
			organisationName ? `${organisationName} AI` : null,
			"latency metrics",
			"token usage",
			"Phaseo",
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
		permanentRedirect(getModelPath(canonicalModelId, "performance"));
	}
	const modelId = canonicalModelId;

	return (
		<ModelDetailShell modelId={modelId} tab="performance" includeHidden={includeHidden}>
			<ModelPerformanceSection
				modelId={modelId}
				includeHidden={includeHidden}
				surface="page"
			/>
		</ModelDetailShell>
	);
}
