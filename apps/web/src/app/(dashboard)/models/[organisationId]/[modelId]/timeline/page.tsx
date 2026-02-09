import { buildMetadata } from "@/lib/seo";
import { getModelOverview } from "@/lib/fetchers/models/getModel";
import ModelReleaseTimeline from "@/components/(data)/model/ModelReleaseTimeline";
import ModelDetailShell from "@/components/(data)/model/ModelDetailShell";
import type { Metadata } from "next";
import {
	getModelIdFromParams,
	type ModelRouteParams,
} from "@/components/(data)/model/model-route-helpers";

async function fetchModel(modelId: string, includeHidden: boolean) {
	try {
		return await getModelOverview(modelId, includeHidden);
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
	const modelId = getModelIdFromParams(params);
	const includeHidden = false;
	const model = await fetchModel(modelId, includeHidden);
	const path = `/models/${modelId}/timeline`;
	const imagePath = `/og/models/${modelId}`;

	if (!model) {
		return buildMetadata({
			title: "Model Timeline Overview",
			description:
				"Explore AI model release timelines on AI Stats, including announcements, releases, and retirement dates.",
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
	const modelId = getModelIdFromParams(routeParams);
	const includeHidden = false;
	const model = await fetchModel(modelId, includeHidden);

	return (
		<ModelDetailShell modelId={modelId} tab="timeline" includeHidden={includeHidden}>
			<ModelReleaseTimeline modelId={modelId} includeHidden={includeHidden} />
		</ModelDetailShell>
	);
}
