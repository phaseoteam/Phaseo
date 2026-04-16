import { buildMetadata } from "@/lib/seo";
import ModelDetailShell from "@/components/(data)/model/ModelDetailShell";
import { ModelBenchmarksSection } from "@/components/(data)/model/overview/ModelOverviewSections";
import { getModelOverviewCached } from "@/lib/fetchers/models/getModel";
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
	const path = getModelPath(modelId, "benchmarks");
	const imagePath = `/og/models/${modelId}`;

	if (!model) {
		return buildMetadata({
			title: "Model Benchmarks Overview",
			description:
				"Explore detailed benchmark scores for AI models on AI Stats and compare performance across industry-standard evaluations, category breakdowns, and historical result updates.",
			path,
			keywords: ["AI model benchmarks", "AI performance", "AI Stats"],
			imagePath,
		});
	}

	const organisationName = model.organisation?.name ?? "AI provider";

	const description = [
		`${model.name} benchmarks by ${organisationName} on AI Stats.`,
		"Review benchmark highlights and use Compare for side-by-side benchmark analysis.",
	]
		.filter(Boolean)
		.join(" ");

	return buildMetadata({
		title: `${model.name} Benchmarks - Performance Highlights`,
		description,
		path,
		keywords: [
			model.name,
			`${model.name} benchmarks`,
			`${organisationName} AI`,
			"AI model performance",
			"AI model comparisons",
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
		permanentRedirect(getModelPath(canonicalModelId, "benchmarks"));
	}
	const modelId = canonicalModelId;

	return (
		<ModelDetailShell modelId={modelId} tab="benchmarks" includeHidden={includeHidden}>
			<ModelBenchmarksSection modelId={modelId} includeHidden={includeHidden} />
		</ModelDetailShell>
	);
}
