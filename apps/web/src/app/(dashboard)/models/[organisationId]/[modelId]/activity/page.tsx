import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import ModelDetailShell from "@/components/(data)/model/ModelDetailShell";
import { ModelActivitySection } from "@/components/(data)/model/overview/ModelOverviewSections";
import {
	getModelPath,
	getModelMetadataIdentity,
	resolveModelRouteIds,
	type ModelRouteParams,
} from "@/components/(data)/model/model-route-helpers";

export async function generateMetadata(props: {
	params: Promise<ModelRouteParams>;
}): Promise<Metadata> {
	const params = await props.params;
	const { modelId, modelName, organisationName } = await getModelMetadataIdentity(
		params,
		false,
	);
	const path = getModelPath(modelId, "activity");
	const imagePath = `/og/models/${modelId}`;

	return buildMetadata({
		title: `${modelName} Activity - Usage and Uptime`,
		description:
			`Track recent usage and uptime signals for ${modelName} on AI Stats, including request volume, success rates, active providers, and token movement.`,
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

	return (
		<ModelDetailShell modelId={modelId} tab="activity" includeHidden={includeHidden}>
			<ModelActivitySection modelId={modelId} includeHidden={includeHidden} />
		</ModelDetailShell>
	);
}
