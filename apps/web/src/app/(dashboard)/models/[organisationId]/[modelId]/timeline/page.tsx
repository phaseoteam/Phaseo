import { buildMetadata } from "@/lib/seo";
import ModelReleaseTimeline from "@/components/(data)/model/ModelReleaseTimeline";
import ModelDetailShell from "@/components/(data)/model/ModelDetailShell";
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
	const path = getModelPath(modelId, "timeline");
	const imagePath = `/og/models/${modelId}`;

	return buildMetadata({
		title: `${modelName} Timeline - Announcements & Release History`,
		description:
			`Explore the release timeline for ${modelName} on AI Stats, including announcements, launches, version changes, deprecations, and retirement milestones over time.`,
		path,
		imagePath,
		keywords: [
			modelName,
			`${modelName} timeline`,
			organisationName ? `${organisationName} AI` : null,
			"AI model releases",
			"AI Stats",
		].filter(Boolean) as string[],
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
		permanentRedirect(getModelPath(canonicalModelId, "timeline"));
	}
	const modelId = canonicalModelId;

	return (
		<ModelDetailShell modelId={modelId} tab="timeline" includeHidden={includeHidden}>
			<ModelReleaseTimeline modelId={modelId} includeHidden={includeHidden} />
		</ModelDetailShell>
	);
}
