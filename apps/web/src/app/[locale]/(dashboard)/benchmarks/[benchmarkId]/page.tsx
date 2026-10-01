import BenchmarkDetailShell from "@/components/(data)/benchmark/BenchmarkDetailShell";
import BenchmarkOverview from "@/components/(data)/benchmark/BenchmarkOverview";
import { fetchFrontendBenchmark } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/seo";
import { getLocale, getTranslations } from "next-intl/server";
import { buildLocalizedPageMetadata } from "@/lib/auth/localized-metadata";
import { JsonLdScript } from "@/components/seo/JsonLdScript";

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
	const locale = await getLocale();
	const t = await getTranslations("Catalogue.benchmarks");
	const { benchmarkId } = await props.params;
	const benchmark = await fetchBenchmark(benchmarkId);
	const path = `/benchmarks/${benchmarkId}`;
	const imagePath = `/og/benchmarks/${benchmarkId}`;

	// Fallback if the benchmark can't be loaded
	if (!benchmark) {
		return buildLocalizedPageMetadata({
			locale: locale as never,
			pathname: path,
			title: t("metadataFallbackTitle"),
			description: t("metadataFallbackDescription"),
			keywords: [
				t("keywordAiBenchmark"),
				t("keywordBenchmarkLeaderboard"),
				t("keywordModelEvaluation"),
				t("keywordModelPerformance"),
				"Phaseo",
			],
			imagePath,
		});
	}

	const cleanName: string = benchmark.name ?? t("keywordAiBenchmark");
	const modelCount = benchmark.results?.length ?? 0;

	return buildLocalizedPageMetadata({
		locale: locale as never,
		pathname: path,
		title: t("detailMetadataTitle", { name: cleanName }),
		description: t("detailMetadataDescription", { name: cleanName, count: modelCount }),
		keywords: [
			cleanName,
			t("keywordAiBenchmark"),
			t("keywordBenchmarkLeaderboard"),
			t("keywordModelEvaluation"),
			t("keywordModelPerformance"),
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
	const t = await getTranslations("Catalogue.benchmarks");
	const tNav = await getTranslations("Common.nav");
	const { benchmarkId } = await params;
	const benchmark = await fetchFrontendBenchmark(benchmarkId);

	if (!benchmark) {
		notFound();
	}

	// Generate structured data for the benchmark page.
	const generateStructuredData = () => {
		const benchmarkName = benchmark.name || t("keywordAiBenchmark");

		// Dataset Schema
		const datasetSchema = {
			"@context": "https://schema.org",
			"@type": "Dataset",
			"name": benchmarkName,
			"description": t("detailMetadataDescription", {
				name: benchmarkName,
				count: benchmark.results?.length ?? 0,
			}),
			"keywords": `${benchmarkName}, ${t("keywordAiBenchmark")}, ${t("keywordModelEvaluation")}, ${t("keywordBenchmarkLeaderboard")}, ${t("keywordModelPerformance")}`,
		};

		// Breadcrumb Schema
		const breadcrumbSchema = {
			"@context": "https://schema.org",
			"@type": "BreadcrumbList",
			"itemListElement": [
				{
					"@type": "ListItem",
					"position": 1,
					"name": tNav("home"),
					"item": absoluteUrl("/"),
				},
				{
					"@type": "ListItem",
					"position": 2,
					"name": t("title"),
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
			<BenchmarkDetailShell benchmark={benchmark} tocItems={[{ id: "summary", label: t("tocSummary") }, { id: "progress", label: t("tocProgress") }, { id: "model-results", label: t("tocModelResults") }]}>
				<BenchmarkOverview benchmark={benchmark} />
			</BenchmarkDetailShell>
		</>
	);
}
