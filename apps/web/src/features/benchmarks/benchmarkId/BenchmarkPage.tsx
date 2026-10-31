import BenchmarkDetailShell from "@/components/(data)/benchmark/BenchmarkDetailShell";
import BenchmarkOverview from "@/components/(data)/benchmark/BenchmarkOverview";
import { isArtificialAnalysisBenchmark } from "@/lib/benchmarks/artificialAnalysis";
import { isEpochCapabilitiesIndex } from "@/lib/benchmarks/epoch";
import { fetchFrontendBenchmark } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { notFound } from "@/lib/navigation";
import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { absoluteUrl } from "@/lib/seo";
import { getLocale, getTranslations } from "@/i18n/server";
import { buildLocalizedPageMetadata } from "@/lib/auth/localized-metadata";
import { JsonLdScript } from "@/components/seo/JsonLdScript";
import { useParams, useSearch } from "@tanstack/react-router";
import type { RouteMetadataInput } from "@/lib/start/metadata";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useTranslations } from "@/i18n/react";
import { artificialAnalysisRankingsQuery, benchmarkQuery, benchmarkSelection } from "./page.queries";

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

export async function getBenchmarkMetadata({ params }: RouteMetadataInput): Promise<PageMetadata> {
	const locale = await getLocale();
	const t = await getTranslations("Catalogue.benchmarks");
	const { benchmarkId } = params;
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

	const cleanName: string = benchmark.suite?.name ?? benchmark.name ?? t("keywordAiBenchmark");
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

export default function BenchmarkPage() {
	const t = useTranslations("Catalogue.benchmarks");
	const tNav = useTranslations("Common.nav");
	const { benchmarkId } = useParams({ from: "/{-$locale}/_dashboard/benchmarks/$benchmarkId/" });
	const search = useSearch({ from: "/{-$locale}/_dashboard/benchmarks/$benchmarkId/" });
	const selection = benchmarkSelection(benchmarkId, search);
	// Unknown benchmarks 404 in the route loader before rendering.
	const { data: benchmark } = useSuspenseQuery(benchmarkQuery(benchmarkId, selection));
	const { data: resolvedArtificialAnalysisRankings } = useSuspenseQuery(
		artificialAnalysisRankingsQuery(benchmark, `${selection.version ?? ""}:${selection.metric ?? ""}`),
	);

	if (!benchmark) {
		notFound();
	}
	const artificialAnalysis = isArtificialAnalysisBenchmark(benchmark.id);
	const epochCapabilitiesIndex = isEpochCapabilitiesIndex(benchmark.id);
	const displayBenchmark = benchmark;
	const artificialAnalysisRankings = artificialAnalysis
		? resolvedArtificialAnalysisRankings
		: [];

	// Generate structured data for the benchmark page.
	const generateStructuredData = () => {
		const benchmarkName = benchmark.suite?.name ?? benchmark.name ?? t("keywordAiBenchmark");

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
			<BenchmarkDetailShell benchmark={displayBenchmark} tocItems={artificialAnalysis
				? []
				: epochCapabilitiesIndex ? []
				: [{ id: "summary", label: t("tocSummary") }, { id: "progress", label: t("tocProgress") }, { id: "model-results", label: t("tocModelResults") }]}>
				<BenchmarkOverview benchmark={displayBenchmark} artificialAnalysisRankings={artificialAnalysisRankings} />
			</BenchmarkDetailShell>
		</>
	);
}
