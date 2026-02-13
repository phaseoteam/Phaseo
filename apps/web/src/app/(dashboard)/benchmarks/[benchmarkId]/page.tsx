import BenchmarkDetailShell from "@/components/(data)/benchmark/BenchmarkDetailShell";
import BenchmarkOverview from "@/components/(data)/benchmark/BenchmarkOverview";
import { getBenchmarkCached } from "@/lib/fetchers/benchmarks/getBenchmark";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import Script from "next/script";
import { cacheLife } from "next/cache";

function parseScore(score: string | number | null | undefined): number | null {
	if (score == null) return null;
	if (typeof score === "number") return Number.isFinite(score) ? score : null;
	if (typeof score === "string") {
		const match = score.match(/[-+]?[0-9]*\.?[0-9]+/);
		if (!match) return null;
		const parsed = Number.parseFloat(match[0]);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

async function fetchBenchmark(benchmarkId: string, includeHidden: boolean) {
	try {
		return await getBenchmarkCached(benchmarkId, includeHidden);
	} catch (error) {
		console.warn("[seo] failed to load benchmark metadata", {
			benchmarkId,
			error,
		});
		return null;
	}
}

export async function generateMetadata(props: {
	params: Promise<{ benchmarkId: string }>;
}): Promise<Metadata> {
	const { benchmarkId } = await props.params;
	const includeHidden = false;
	const benchmark = await fetchBenchmark(benchmarkId, includeHidden);
	const path = `/benchmarks/${benchmarkId}`;
	const imagePath = `/og/benchmarks/${benchmarkId}`;

	// Fallback if the benchmark can't be loaded
	if (!benchmark) {
		return buildMetadata({
			title: "AI Benchmark Leaderboard",
			description:
				"Explore AI benchmark leaderboards on AI Stats and compare model performance across tasks and datasets.",
			path,
			keywords: [
				"AI benchmark",
				"AI benchmark leaderboard",
				"model evaluation",
				"AI model performance",
				"AI Stats",
			],
			imagePath,
		});
	}

	const cleanName: string = benchmark.name ?? "AI benchmark";
	const results = benchmark.results ?? [];
	const orderHints = results
		.map(
			(result: any) => result?.benchmark?.order ?? result?.benchmark_order
		)
		.filter((value: unknown): value is string => typeof value === "string");
	const isLowerBetter = orderHints.some(
		(order) => order.toLowerCase() === "lower"
	);

	let bestScore: { value: number; modelName: string } | null = null;
	for (const result of results) {
		const numericScore = parseScore(result.score);
		if (numericScore != null) {
			const shouldReplace =
				!bestScore ||
				(isLowerBetter
					? numericScore < bestScore.value
					: numericScore > bestScore.value);
			if (shouldReplace) {
				bestScore = {
					value: numericScore,
					modelName:
						result.model?.name ??
						result.model_id ??
						"Unknown model",
				};
			}
		}
	}

	const topPerformer = bestScore?.modelName ?? null;
	const modelCount = benchmark.results?.length ?? 0;

	const descriptionParts: (string | undefined)[] = [
		`${cleanName} benchmark leaderboard on AI Stats.`,
		modelCount
			? `See ${modelCount} scored models, track historical performance, and inspect the underlying methodology.`
			: undefined,
		topPerformer ? `Current top model: ${topPerformer}.` : undefined,
	];

	return buildMetadata({
		title: `${cleanName} - Benchmark Leaderboard & Model Performance`,
		description: descriptionParts.filter(Boolean).join(" "),
		path,
		keywords: [
			cleanName,
			`${cleanName} benchmark`,
			`${cleanName} leaderboard`,
			"AI benchmark",
			"model evaluation",
			"AI model performance",
			"AI Stats",
		],
		imagePath,
	});
}

export default async function Page({
	params,
}: {
	params: Promise<{ benchmarkId: string }>;
}) {
	"use cache";
	cacheLife({
		stale: 60 * 60 * 24 * 7,
		revalidate: 60 * 60 * 24 * 7,
		expire: 60 * 60 * 24 * 365,
	});

	const { benchmarkId } = await params;
	const includeHidden = false;
	const benchmark = await getBenchmarkCached(benchmarkId, includeHidden);

	if (!benchmark) {
		notFound();
	}

	// Generate structured data and FAQs for SEO
	const generateStructuredData = () => {
		const benchmarkName = benchmark.name || "Benchmark";
		const results = benchmark.results || [];
		const modelCount = results.length;

		// Find top performer
		const orderHints = results
			.map((result: any) => result?.benchmark?.order ?? result?.benchmark_order)
			.filter((value: unknown): value is string => typeof value === "string");
		const isLowerBetter = orderHints.some((order) => order.toLowerCase() === "lower");

		let topModel: string | null = null;
		let bestScore: number | null = null;

		for (const result of results) {
			const numericScore = parseScore(result.score);
			if (numericScore != null) {
				const shouldReplace =
					bestScore === null ||
					(isLowerBetter ? numericScore < bestScore : numericScore > bestScore);
				if (shouldReplace) {
					bestScore = numericScore;
					topModel = result.model?.name ?? result.model_id ?? null;
				}
			}
		}

		// Dataset Schema
		const datasetSchema = {
			"@context": "https://schema.org",
			"@type": "Dataset",
			"name": benchmarkName,
			"description": `${benchmarkName} is an AI benchmark leaderboard tracked on AI Stats. Compare model performance, view historical results, and understand evaluation methodology.`,
			"keywords": `${benchmarkName}, AI benchmark, model evaluation, leaderboard, AI performance`,
		};

		// FAQ Schema
		const faqSchema = {
			"@context": "https://schema.org",
			"@type": "FAQPage",
			"mainEntity": [
				{
					"@type": "Question",
					"name": `What is ${benchmarkName}?`,
					"acceptedAnswer": {
						"@type": "Answer",
						"text": `${benchmarkName} is an AI benchmark used to evaluate model performance. On AI Stats, you can view ${modelCount} scored models, compare results, track historical performance trends, and understand the evaluation methodology.`,
					},
				},
				{
					"@type": "Question",
					"name": `Which model performs best on ${benchmarkName}?`,
					"acceptedAnswer": {
						"@type": "Answer",
						"text": topModel
							? `Currently, ${topModel} leads the ${benchmarkName} leaderboard with a score of ${bestScore}. Check AI Stats for the full leaderboard, historical performance, and detailed model comparisons.`
							: `View the ${benchmarkName} leaderboard on AI Stats to see which models perform best. We track ${modelCount} models with detailed scores and historical data.`,
					},
				},
				{
					"@type": "Question",
					"name": `How is ${benchmarkName} scored?`,
					"acceptedAnswer": {
						"@type": "Answer",
						"text": `${benchmarkName} uses ${isLowerBetter ? "lower-is-better" : "higher-is-better"} scoring. View the methodology section on AI Stats to understand how models are evaluated, what tasks are tested, and how scores are calculated.`,
					},
				},
				{
					"@type": "Question",
					"name": `How often is ${benchmarkName} updated?`,
					"acceptedAnswer": {
						"@type": "Answer",
						"text": `${benchmarkName} results on AI Stats are updated as new model evaluations are published. Check the timeline view to see when models were added and how performance has evolved over time.`,
					},
				},
				{
					"@type": "Question",
					"name": `Can I compare models on ${benchmarkName}?`,
					"acceptedAnswer": {
						"@type": "Answer",
						"text": `Yes! AI Stats lets you compare model performance on ${benchmarkName}. View side-by-side scores, filter by organization or model family, and analyze performance trends across ${modelCount} evaluated models.`,
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
					"name": "Benchmarks",
					"item": "https://aistats.org/benchmarks",
				},
				{
					"@type": "ListItem",
					"position": 3,
					"name": benchmarkName,
					"item": `https://aistats.org/benchmarks/${benchmarkId}`,
				},
			],
		};

		return { datasetSchema, faqSchema, breadcrumbSchema };
	};

	const structuredData = generateStructuredData();

	return (
		<>
			{structuredData && (
				<>
					<Script
						id="benchmark-dataset-schema"
						type="application/ld+json"
						dangerouslySetInnerHTML={{
							__html: JSON.stringify(structuredData.datasetSchema),
						}}
					/>
					<Script
						id="benchmark-faq-schema"
						type="application/ld+json"
						dangerouslySetInnerHTML={{
							__html: JSON.stringify(structuredData.faqSchema),
						}}
					/>
					<Script
						id="benchmark-breadcrumb-schema"
						type="application/ld+json"
						dangerouslySetInnerHTML={{
							__html: JSON.stringify(structuredData.breadcrumbSchema),
						}}
					/>
				</>
			)}
			<BenchmarkDetailShell benchmark={benchmark}>
				<BenchmarkOverview benchmark={benchmark} />
			</BenchmarkDetailShell>
		</>
	);
}
