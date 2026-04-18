import { getModelOverviewCached } from "@/lib/fetchers/models/getModel";
import ModelOverviewSections, {
	ModelCreatorModelsSection,
} from "@/components/(data)/model/overview/ModelOverviewSections";
import ModelDetailShell from "@/components/(data)/model/ModelDetailShell";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
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
	const path = getModelPath(modelId);
	const imagePath = `/og/models/${modelId}`;

	return buildMetadata({
		title: `${modelName} - Benchmarks, Pricing & API Access`,
		description:
			`Browse benchmarks, providers, pricing, deployment options, and compatibility details for ${modelName} on AI Stats.`,
		path,
		keywords: [
			modelName,
			`${modelName} benchmarks`,
			`${modelName} pricing`,
			organisationName ? `${organisationName} AI` : null,
			"AI Stats",
			"AI model comparison",
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
		permanentRedirect(getModelPath(canonicalModelId));
	}
	const modelId = canonicalModelId;

	const model = await getModelOverviewCached(modelId, includeHidden);

	return (
		<ModelDetailShell modelId={modelId} tab="overview" includeHidden={includeHidden}>
			<ModelOverviewSections
				modelId={modelId}
				model={model}
				includeHidden={includeHidden}
			/>
			{model ? (
				<div className="mt-10">
					<ModelCreatorModelsSection
						modelId={modelId}
						includeHidden={includeHidden}
						model={model}
					/>
				</div>
			) : null}
		</ModelDetailShell>
	);
}

