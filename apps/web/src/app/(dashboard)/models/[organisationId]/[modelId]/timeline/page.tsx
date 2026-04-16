import { buildMetadata } from "@/lib/seo";
import { getModelOverviewCached } from "@/lib/fetchers/models/getModel";
import ModelReleaseTimeline from "@/components/(data)/model/ModelReleaseTimeline";
import ModelDetailShell from "@/components/(data)/model/ModelDetailShell";
import type { Metadata } from "next";
import {
	getModelPath,
	resolveModelRouteIds,
	type ModelRouteParams,
} from "@/components/(data)/model/model-route-helpers";
import { permanentRedirect } from "next/navigation";

async function fetchModel(modelId: string, includeHidden: boolean) {
	try {
		return await getModelOverviewCached(modelId, includeHidden);
	} catch (error) {
		console.warn("[seo] failed to load model overview for metadata", {
			modelId,
			error,
		});
		return null;
	}
}

export async function generateMetadata(props: {
	params: Promise<ModelRouteParams>;
}): Promise<Metadata> {
	const params = await props.params;
	const includeHidden = false;
	const { canonicalModelId: modelId } = await resolveModelRouteIds(
		params,
		includeHidden,
	);
	const model = await fetchModel(modelId, includeHidden);
	const path = getModelPath(modelId, "timeline");
	const imagePath = `/og/models/${modelId}`;

	if (!model) {
		return buildMetadata({
			title: "Model Timeline Overview",
			description:
				"Explore the release timeline for this AI model on AI Stats, including announcements, launches, version changes, deprecations, and retirement milestones over time.",
			path,
			keywords: [
				"AI model timeline",
				"AI releases",
				"model history",
				"AI Stats",
			],
			imagePath,
		});
	}

	const organisationName = model.organisation?.name ?? "AI provider";

	const description = [
		`${model.name} release timeline by ${organisationName} on AI Stats.`,
		"See announcements, releases, deprecations, and retirements in one view.",
	]
		.filter(Boolean)
		.join(" ");

	return buildMetadata({
		title: `${model.name} Timeline - Announcements & Release History`,
		description,
		path,
		imagePath,
		keywords: [
			model.name,
			`${model.name} timeline`,
			`${organisationName} AI`,
			"AI model releases",
			"AI Stats",
		],
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
	const model = await fetchModel(modelId, includeHidden);

	if (!model) {
		return (
			<ModelDetailShell
				modelId={modelId}
				tab="timeline"
				includeHidden={includeHidden}
			>
				{null}
			</ModelDetailShell>
		);
	}

	return (
		<ModelDetailShell modelId={modelId} tab="timeline" includeHidden={includeHidden}>
			<ModelReleaseTimeline modelId={modelId} includeHidden={includeHidden} />
		</ModelDetailShell>
	);
}
