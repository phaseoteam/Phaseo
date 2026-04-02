import ModelDetailShell from "@/components/(data)/model/ModelDetailShell";
import { ModelPerformanceSection } from "@/components/(data)/model/overview/ModelOverviewSections";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { getModelOverviewCached } from "@/lib/fetchers/models/getModel";
import {
	getModelPath,
	resolveModelRouteIds,
	type ModelRouteParams,
} from "@/components/(data)/model/model-route-helpers";
import { permanentRedirect } from "next/navigation";

async function fetchModelOverview(modelId: string, includeHidden: boolean) {
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
	const model = await fetchModelOverview(modelId, includeHidden);
	const path = getModelPath(modelId, "performance");
	const imagePath = `/og/models/${modelId}`;

	if (!model) {
		return buildMetadata({
			title: "Model Performance Overview",
			description:
				"Track AI model performance on AI Stats with latency trends, throughput signals, reliability movement, and historical usage metrics across recent gateway traffic.",
			path,
			keywords: ["AI model performance", "AI metrics", "AI Stats"],
			imagePath,
		});
	}

	const organisationName = model.organisation?.name ?? "AI provider";
	const description = [
		`${model.name} performance metrics by ${organisationName} on AI Stats.`,
		"See latency, token trajectory, and other runtime signals over time.",
	]
		.filter(Boolean)
		.join(" ");

	return buildMetadata({
		title: `${model.name} Performance - Latency & Token Trajectory`,
		description,
		path,
		keywords: [
			model.name,
			`${model.name} performance`,
			`${organisationName} AI`,
			"latency metrics",
			"token usage",
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
		permanentRedirect(getModelPath(canonicalModelId, "performance"));
	}
	const modelId = canonicalModelId;

	return (
		<ModelDetailShell modelId={modelId} tab="performance" includeHidden={includeHidden}>
			<ModelPerformanceSection
				modelId={modelId}
				includeHidden={includeHidden}
				surface="page"
			/>
		</ModelDetailShell>
	);
}
