import { buildMetadata } from "@/lib/seo";
import ModelDetailShell from "@/components/(data)/model/ModelDetailShell";
import ModelBenchmarks from "@/components/(data)/model/benchmarks/ModelBenchmarks";
import {
	getModelBenchmarkHighlights,
} from "@/lib/fetchers/models/getModelBenchmarkData";
import { getModelOverview } from "@/lib/fetchers/models/getModel";
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
	const path = `/models/${modelId}/benchmarks`;
	const imagePath = `/og/models/${modelId}`;

	if (!model) {
		return buildMetadata({
			title: "Model Benchmarks Overview",
			description:
				"Explore detailed benchmark scores for AI models on AI Stats. Compare performance across industry-standard tests.",
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
	const modelId = getModelIdFromParams(routeParams);
	const includeHidden = false;

	const highlightCards = await getModelBenchmarkHighlights(
		modelId,
		includeHidden
	);

	return (
		<ModelDetailShell modelId={modelId} tab="benchmarks" includeHidden={includeHidden}>
			<ModelBenchmarks
				modelId={modelId}
				highlightCards={highlightCards}
				mode="summary"
			/>
		</ModelDetailShell>
	);
}
