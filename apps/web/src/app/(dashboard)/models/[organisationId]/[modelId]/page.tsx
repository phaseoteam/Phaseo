import { getModelOverviewCached } from "@/lib/fetchers/models/getModel";
import ModelOverview from "@/components/(data)/model/overview/ModelOverview";
import ModelDetailShell from "@/components/(data)/model/ModelDetailShell";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import {
	getModelIdFromParams,
	type ModelRouteParams,
} from "@/components/(data)/model/model-route-helpers";
import ModelNotFoundState from "@/components/(data)/model/ModelNotFoundState";

async function fetchModelForMetadata(modelId: string, includeHidden: boolean) {
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
	const modelId = getModelIdFromParams(params);
	const includeHidden = false;
	const model = await fetchModelForMetadata(modelId, includeHidden);
	const path = `/models/${modelId}`;
	const imagePath = `/og/models/${modelId}`;

	// Fallback if the model can't be loaded
	if (!model) {
		return buildMetadata({
			title: "AI Model Overview",
			description:
				"Browse individual AI model pages on AI Stats for benchmarks, providers, pricing, and deployment options across the ecosystem.",
			path,
			keywords: [
				"AI model",
				"AI benchmarks",
				"AI providers",
				"AI Stats",
				"model comparison",
			],
			imagePath,
		});
	}

	const organisationName = model.organisation?.name ?? "AI provider";

	const summaryParts: string[] = [];
	const releaseYear = model.release_date
		? new Date(model.release_date).getFullYear()
		: null;

	const modalities: string[] = [];
	if (model.input_types) modalities.push(model.input_types);
	if (model.output_types) modalities.push(model.output_types);

	if (modalities.length) {
		summaryParts.push(
			`Modalities: ${modalities
				.filter(Boolean)
				.map((m) => m.toLowerCase())
				.join(", ")}.`
		);
	}

	if (releaseYear) {
		summaryParts.push(`Released ${releaseYear}.`);
	}

	const description = [
		`${model.name} is an AI model by ${organisationName}, tracked on AI Stats.`,
		"View benchmarks, compatible providers, pricing models, and launch milestones in one place.",
		summaryParts.join(" "),
	]
		.filter(Boolean)
		.join(" ");

	return buildMetadata({
		title: `${model.name} - Benchmarks, Pricing & API Access`,
		description,
		path,
		keywords: [
			model.name,
			`${model.name} benchmarks`,
			`${model.name} pricing`,
			`${organisationName} AI`,
			"AI Stats",
			"AI model comparison",
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

	const model = await getModelOverviewCached(modelId, includeHidden);

	if (!model) {
		return <ModelNotFoundState modelId={modelId} />;
	}

	// console.log("ModelPage model:", model);

	return (
		<ModelDetailShell modelId={modelId} tab="overview">
			<ModelOverview model={model} />
		</ModelDetailShell>
	);
}

