import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import ModelDetailShell from "@/components/(data)/model/ModelDetailShell";
import { ModelAppsSection } from "@/components/(data)/model/overview/ModelOverviewSections";
import {
	getModelPath,
	getModelMetadataIdentity,
	resolveModelRouteIds,
	type ModelRouteParams,
} from "@/components/(data)/model/model-route-helpers";
import { buildModelPageMetadataDescription } from "@/lib/models/modelDescription";

export async function generateMetadata(props: {
	params: Promise<ModelRouteParams>;
}): Promise<Metadata> {
	const params = await props.params;
	const { modelId, modelName, organisationName, modelDescription } = await getModelMetadataIdentity(
		params,
		false,
	);
	const path = getModelPath(modelId, "apps");
	const imagePath = `/og/models/${modelId}`;

	return buildMetadata({
		title: `${modelName} Apps - Product and Plan Availability`,
		description: buildModelPageMetadataDescription({
			modelDescription,
			suffix:
				"See which public apps are actively sending gateway requests to this model on Phaseo.",
			fallback: `See which public apps are actively sending gateway requests to ${modelName} on Phaseo.`,
		}),
		path,
		keywords: [
			modelName,
			`${modelName} apps`,
			`${modelName} app usage`,
			organisationName ? `${organisationName} AI` : null,
			"gateway request usage",
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
		permanentRedirect(getModelPath(canonicalModelId, "apps"));
	}
	const modelId = canonicalModelId;

	return (
		<ModelDetailShell modelId={modelId} tab="apps" includeHidden={includeHidden}>
			<ModelAppsSection modelId={modelId} includeHidden={includeHidden} />
		</ModelDetailShell>
	);
}
