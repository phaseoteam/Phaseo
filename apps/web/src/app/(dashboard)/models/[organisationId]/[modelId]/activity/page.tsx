import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import ModelDetailShell from "@/components/(data)/model/ModelDetailShell";
import { ModelActivitySection } from "@/components/(data)/model/overview/ModelOverviewSections";
import { getModelOverviewCached } from "@/lib/fetchers/models/getModel";
import {
	getModelPath,
	resolveModelRouteIds,
	type ModelRouteParams,
} from "@/components/(data)/model/model-route-helpers";

async function fetchModel(modelId: string, includeHidden: boolean) {
	try {
		return await getModelOverviewCached(modelId, includeHidden);
	} catch (error) {
		console.warn("[seo] failed to load model overview for activity metadata", {
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
	const path = getModelPath(modelId, "activity");
	const imagePath = `/og/models/${modelId}`;

	if (!model) {
		return buildMetadata({
			title: "Model Activity and Uptime",
			description:
				"Track recent usage and uptime signals for this AI model on AI Stats, including request volume, success rates, active providers, and token movement.",
			path,
			keywords: ["AI model activity", "AI uptime", "AI usage metrics", "AI Stats"],
			imagePath,
		});
	}

	const organisationName = model.organisation?.name ?? "AI provider";
	const description = [
		`${model.name} recent usage and uptime by ${organisationName} on AI Stats.`,
		"See request volume, success rate, provider traffic, and cumulative token activity.",
	]
		.filter(Boolean)
		.join(" ");

	return buildMetadata({
		title: `${model.name} Activity - Usage and Uptime`,
		description,
		path,
		keywords: [
			model.name,
			`${model.name} uptime`,
			`${model.name} usage`,
			`${organisationName} AI`,
			"AI reliability metrics",
			"AI Stats",
		],
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
