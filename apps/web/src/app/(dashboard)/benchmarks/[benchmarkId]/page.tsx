import BenchmarkDetailShell from "@/components/(data)/benchmark/BenchmarkDetailShell";
import BenchmarkOverview from "@/components/(data)/benchmark/BenchmarkOverview";
import { isArtificialAnalysisBenchmark } from "@/lib/benchmarks/artificialAnalysis";
import { fetchFrontendBenchmark } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { absoluteUrl, buildMetadata } from "@/lib/seo";
import { JsonLdScript } from "@/components/seo/JsonLdScript";
import {
	buildBenchmarkMetadataDescription,
	buildBenchmarkMetadataTitle,
} from "@/lib/benchmarks/metadata";

async function fetchBenchmark(benchmarkId: string) {
	try {
		return await fetchFrontendBenchmark(benchmarkId);
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
	const benchmark = await fetchBenchmark(benchmarkId);
	const path = `/benchmarks/${benchmarkId}`;
	const imagePath = `/og/benchmarks/${benchmarkId}`;

	// Fallback if the benchmark can't be loaded
	if (!benchmark) {
		return buildMetadata({
			title: "AI Benchmark Leaderboard",
			description:
				"Explore AI benchmark leaderboards on Phaseo to compare model performance across tasks, datasets, methodology details, and historical score movement.",
			path,
			keywords: [
				"AI benchmark",
				"AI benchmark leaderboard",
				"model evaluation",
				"AI model performance",
				"Phaseo",
			],
			imagePath,
		});
	}

	const cleanName: string = benchmark.name ?? "AI benchmark";
	const modelCount = benchmark.results?.length ?? 0;

	return buildMetadata({
		title: buildBenchmarkMetadataTitle(cleanName),
		description: buildBenchmarkMetadataDescription(cleanName, modelCount),
		path,
		keywords: [
			cleanName,
			`${cleanName} benchmark`,
			`${cleanName} leaderboard`,
			"AI benchmark",
			"model evaluation",
			"AI model performance",
			"Phaseo",
		],
		imagePath,
	});
}

export default async function Page({
	params,
}: {
	params: Promise<{ benchmarkId: string }>;
}) {
	const { benchmarkId } = await params;
	const benchmark = await fetchFrontendBenchmark(benchmarkId);

	if (!benchmark) {
		notFound();
	}

	// Generate structured data for the benchmark page.
	const generateStructuredData = () => {
		const benchmarkName = benchmark.name || "Benchmark";

		// Dataset Schema
		const datasetSchema = {
			"@context": "https://schema.org",
			"@type": "Dataset",
			"name": benchmarkName,
			"description": `${benchmarkName} is an AI benchmark leaderboard tracked on Phaseo. Compare model performance, view historical results, and understand evaluation methodology.`,
			"keywords": `${benchmarkName}, AI benchmark, model evaluation, leaderboard, AI performance`,
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
					"item": absoluteUrl("/"),
				},
				{
					"@type": "ListItem",
					"position": 2,
					"name": "Benchmarks",
					"item": absoluteUrl("/benchmarks"),
				},
				{
					"@type": "ListItem",
					"position": 3,
					"name": benchmarkName,
					"item": absoluteUrl(`/benchmarks/${benchmarkId}`),
				},
			],
		};

		return { datasetSchema, breadcrumbSchema };
	};

	const structuredData = generateStructuredData();

	return (
		<>
			{structuredData && (
				<>
					<JsonLdScript id="benchmark-dataset-schema" data={structuredData.datasetSchema} />
					<JsonLdScript id="benchmark-breadcrumb-schema" data={structuredData.breadcrumbSchema} />
				</>
			)}
			<BenchmarkDetailShell benchmark={benchmark} tocItems={isArtificialAnalysisBenchmark(benchmark.id)
				? [{ id: "summary", label: "Summary" }, { id: "model-results", label: "Model Results" }, { id: "progress", label: "Progress" }]
				: [{ id: "summary", label: "Summary" }, { id: "progress", label: "Progress" }, { id: "model-results", label: "Model Results" }]}>
				<BenchmarkOverview benchmark={benchmark} />
			</BenchmarkDetailShell>
		</>
	);
}
