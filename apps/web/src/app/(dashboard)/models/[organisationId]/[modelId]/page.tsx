import { getModelOverviewCached } from "@/lib/fetchers/models/getModel";
import ModelOverview from "@/components/(data)/model/overview/ModelOverview";
import Image from "next/image";
import ModelDetailShell from "@/components/(data)/model/ModelDetailShell";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { withUTM } from "@/lib/utm";
import Script from "next/script";
import {
	getModelIdFromParams,
	type ModelRouteParams,
} from "@/components/(data)/model/model-route-helpers";
import { resolveIncludeHidden } from "@/lib/fetchers/models/visibility";

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
	const includeHidden = await resolveIncludeHidden();
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
	const includeHidden = await resolveIncludeHidden();

	const model = await getModelOverviewCached(modelId, includeHidden);

	// Generate structured data and FAQs for SEO
	const generateStructuredData = () => {
		if (!model) return null;

		const organisationName = model.organisation?.name || "AI provider";
		const releaseYear = model.release_date ? new Date(model.release_date).getFullYear() : null;
		const modalities = [model.input_types, model.output_types].filter(Boolean);

		// Product Schema
		const productSchema = {
			"@context": "https://schema.org",
			"@type": "SoftwareApplication",
			"name": model.name,
			"description": `${model.name} is an AI model developed by ${organisationName}. ${modalities.length ? `Supports ${modalities.join(", ")} modalities.` : ""} ${releaseYear ? `Released in ${releaseYear}.` : ""}`,
			"applicationCategory": "AI Model",
			"creator": {
				"@type": "Organization",
				"name": organisationName,
			},
			"offers": {
				"@type": "Offer",
				"availability": "https://schema.org/InStock",
			},
		};

		// FAQ Schema
		const faqSchema = {
			"@context": "https://schema.org",
			"@type": "FAQPage",
			"mainEntity": [
				{
					"@type": "Question",
					"name": `What is ${model.name}?`,
					"acceptedAnswer": {
						"@type": "Answer",
						"text": `${model.name} is an AI model developed by ${organisationName}${releaseYear ? ` and released in ${releaseYear}` : ""}. ${modalities.length ? `It supports ${modalities.join(" and ")} modalities.` : ""} You can view benchmarks, pricing, and API access information on AI Stats.`,
					},
				},
				{
					"@type": "Question",
					"name": `Who makes ${model.name}?`,
					"acceptedAnswer": {
						"@type": "Answer",
						"text": `${model.name} is developed by ${organisationName}. You can find detailed information about the model, including performance benchmarks, pricing across different providers, and availability on AI Stats.`,
					},
				},
				{
					"@type": "Question",
					"name": `How do I access ${model.name}?`,
					"acceptedAnswer": {
						"@type": "Answer",
						"text": `${model.name} can be accessed through various API providers. Check the Availability tab on AI Stats to see which providers offer ${model.name}, compare pricing across different platforms, and view API documentation links.`,
					},
				},
				{
					"@type": "Question",
					"name": `What are the benchmarks for ${model.name}?`,
					"acceptedAnswer": {
						"@type": "Answer",
						"text": `${model.name} performance can be evaluated across multiple benchmarks. Visit the Benchmarks tab on AI Stats to see detailed scores, compare against other models, and understand the model's strengths across different tasks and datasets.`,
					},
				},
				{
					"@type": "Question",
					"name": `How much does ${model.name} cost?`,
					"acceptedAnswer": {
						"@type": "Answer",
						"text": `${model.name} pricing varies by provider and endpoint. Check the Pricing tab on AI Stats to compare costs across OpenAI, Anthropic, Google, AWS Bedrock, Azure, and other providers. We show input/output token pricing, cached token rates, and batch API pricing.`,
					},
				},
			],
		};

		// Breadcrumb Schema
		const breadcrumbSchema = {
			"@context": "https://schema.org",
			"@type": "BreadcrumbList",
			"itemListElement": [
				{
					"@type": "ListItem",
					"position": 1,
					"name": "Home",
					"item": "https://aistats.org",
				},
				{
					"@type": "ListItem",
					"position": 2,
					"name": "Models",
					"item": "https://aistats.org/models",
				},
				{
					"@type": "ListItem",
					"position": 3,
					"name": organisationName,
					"item": `https://aistats.org/models/${routeParams.organisationId}`,
				},
				{
					"@type": "ListItem",
					"position": 4,
					"name": model.name,
					"item": `https://aistats.org/models/${modelId}`,
				},
			],
		};

		return { productSchema, faqSchema, breadcrumbSchema };
	};

	const structuredData = generateStructuredData();

	if (!model) {
		return (
			<main className="flex min-h-screen flex-col">
				<div className="container mx-auto px-4 py-8">
					<div className="rounded-lg border border-dashed p-6 md:p-8 text-center bg-muted/30">
						<div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
							<span className="text-xl">🤖</span>
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
		<>
			{structuredData && (
				<>
					<Script
						id="model-product-schema"
						type="application/ld+json"
						dangerouslySetInnerHTML={{
							__html: JSON.stringify(structuredData.productSchema),
						}}
					/>
					<Script
						id="model-faq-schema"
						type="application/ld+json"
						dangerouslySetInnerHTML={{
							__html: JSON.stringify(structuredData.faqSchema),
						}}
					/>
					<Script
						id="model-breadcrumb-schema"
						type="application/ld+json"
						dangerouslySetInnerHTML={{
							__html: JSON.stringify(structuredData.breadcrumbSchema),
						}}
					/>
				</>
			)}
		<ModelDetailShell modelId={modelId} tab="overview" includeHidden={includeHidden}>
				<ModelOverview model={model} />
			</ModelDetailShell>
		</>
	);
}
