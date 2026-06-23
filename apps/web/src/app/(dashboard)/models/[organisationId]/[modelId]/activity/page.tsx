import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import {
	getModelPath,
	getModelSectionPath,
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
	const path = getModelPath(modelId, "activity");
	const imagePath = `/og/models/${modelId}`;

	return buildMetadata({
		title: `${modelName} Activity - Usage and Uptime`,
		description: buildModelPageMetadataDescription({
			modelDescription,
			suffix:
				"Track recent usage and uptime signals, including request volume, success rates, active providers, and token movement.",
			fallback: `Track recent usage and uptime signals for ${modelName} on AI Stats, including request volume, success rates, active providers, and token movement.`,
		}),
		path,
		keywords: [
			modelName,
			`${modelName} uptime`,
			`${modelName} usage`,
			organisationName ? `${organisationName} AI` : null,
			"AI reliability metrics",
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
		permanentRedirect(getModelPath(canonicalModelId, "activity"));
	}
	const modelId = canonicalModelId;

	permanentRedirect(getModelSectionPath(modelId, "activity"));
}
