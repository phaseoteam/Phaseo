import ModelDetailShell from "@/components/(data)/model/ModelDetailShell";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { ModelProvidersSection } from "@/components/(data)/model/overview/ModelOverviewSections";
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
	const path = getModelPath(modelId, "providers");
	const imagePath = `/og/models/${modelId}`;

	return buildMetadata({
		title: `${modelName} Providers - Availability & Pricing Details`,
		description: buildModelPageMetadataDescription({
			modelDescription,
			suffix:
				"View providers, availability, subscription coverage, and pricing details across supported API endpoints.",
			fallback: `View providers for ${modelName} on Phaseo, including availability, subscription coverage, and pricing details across supported API endpoints.`,
		}),
		path,
		keywords: [
			modelName,
			`${modelName} providers`,
			`${modelName} pricing`,
			`${modelName} subscriptions`,
			organisationName ? `${organisationName} AI` : null,
			"token pricing",
			"AI billing",
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
		permanentRedirect(getModelPath(canonicalModelId, "providers"));
	}
	const modelId = canonicalModelId;

	return (
		<ModelDetailShell modelId={modelId} tab="providers" includeHidden={includeHidden}>
			<ModelProvidersSection modelId={modelId} includeHidden={includeHidden} />
		</ModelDetailShell>
	);
}
