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
	const path = getModelPath(modelId, "pricing");
	const imagePath = `/og/models/${modelId}`;

	return buildMetadata({
		title: `${modelName} Pricing - Effective Cost & History`,
		description: buildModelPageMetadataDescription({
			modelDescription,
			suffix:
				"Track weighted effective input and output pricing plus 30-day pricing history by provider and meter.",
			fallback: `${modelName} pricing on AI Stats. Track weighted effective input/output pricing and 30-day pricing history by provider and meter.`,
		}),
		path,
		keywords: [
			modelName,
			`${modelName} pricing`,
			`${modelName} effective pricing`,
			`${modelName} pricing history`,
			organisationName ? `${organisationName} AI` : null,
			"token pricing",
			"AI billing",
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
		permanentRedirect(getModelPath(canonicalModelId, "pricing"));
	}
	const modelId = canonicalModelId;

	permanentRedirect(getModelSectionPath(modelId, "pricing"));
}
