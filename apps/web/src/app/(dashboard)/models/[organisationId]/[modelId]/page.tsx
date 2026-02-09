import { getModelOverviewCached } from "@/lib/fetchers/models/getModel";
import ModelOverview from "@/components/(data)/model/overview/ModelOverview";
import Image from "next/image";
import ModelDetailShell from "@/components/(data)/model/ModelDetailShell";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { withUTM } from "@/lib/utm";
import {
	getModelIdFromParams,
	type ModelRouteParams,
} from "@/components/(data)/model/model-route-helpers";

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
	const modelId = getModelIdFromParams(params);
	const includeHidden = false;
	const model = await fetchModel(modelId, includeHidden);
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
		return (
			<main className="flex min-h-screen flex-col">
				<div className="container mx-auto px-4 py-8">
					<div className="rounded-lg border border-dashed p-6 md:p-8 text-center bg-muted/30">
						<div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
							<span className="text-xl">M</span>
						</div>
						<p className="text-base font-medium">Model not found</p>
						<p className="mt-1 text-sm text-muted-foreground">
							We&apos;re continuously adding new models. Got one
							to suggest?
						</p>
						<div className="mt-3">
							<a
								href={withUTM(
									"https://github.com/AI-Stats/AI-Stats/issues/new",
									{
										campaign: "model-suggestion",
										content: "model-detail-empty-state",
									}
								)}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
							>
								Suggest a Model
								<Image
									src="/social/github_light.svg"
									alt="GitHub Logo"
									width={16}
									height={16}
									className="inline dark:hidden"
								/>
								<Image
									src="/social/github_dark.svg"
									alt="GitHub Logo"
									width={16}
									height={16}
									className="hidden dark:inline"
								/>
							</a>
						</div>
					</div>
				</div>
			</main>
		);
	}

	// console.log("ModelPage model:", model);

	return (
		<ModelDetailShell modelId={modelId} tab="overview">
			<ModelOverview model={model} />
		</ModelDetailShell>
	);
}

