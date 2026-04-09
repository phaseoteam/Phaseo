import type { Metadata } from "next";

import { buildMetadata } from "@/lib/seo";
import type { ExtendedModel } from "@/data/types";
import { loadCompareModelsCached } from "@/lib/fetchers/compare/loadCompareModels";
import { getComparisonModelsCached } from "@/lib/fetchers/compare/getComparisonModels";
import { getModelPerformanceMetricsCached } from "@/lib/fetchers/models/getModelPerformance";
import type {
	ModelPerformancePoint,
	ModelProviderDailyPoint,
	ModelProviderPerformance,
	ModelTimeOfDayPoint,
} from "@/lib/fetchers/models/getModelPerformance";
import { getModelTokenTrajectoryCached } from "@/lib/fetchers/models/getModelTokenTrajectory";
import type { ModelTokenTrajectoryPoint } from "@/lib/fetchers/models/getModelTokenTrajectory";
import { getModelRealtimeWindowStatsCached } from "@/lib/fetchers/models/getModelRealtimeWindowStats";
import CompareDashboard from "@/components/(data)/compare/CompareDashboard";
import CompareMiniHeader from "@/components/(data)/compare/CompareMiniHeader";
import type { CompareGatewayUsageByModel } from "@/components/(data)/compare/types";

export const metadata: Metadata = buildMetadata({
	title: "Compare AI Models Side-by-Side",
	description:
		"Stack up to four AI models with benchmarks in common, gateway performance, pricing, context windows, and subscription availability in one shareable view.",
	path: "/compare",
	keywords: [
		"AI model comparison",
		"compare AI models",
		"AI benchmarks",
		"AI model pricing",
		"machine learning models",
		"AI providers",
		"AI gateway performance",
		"AI Stats",
	],
	imagePath: "/compare/opengraph-image",
	imageAlt: "AI Stats model comparison preview",
	openGraph: {
		type: "website",
	},
});

type PageProps = {
	searchParams?:
		| Promise<Record<string, string | string[] | undefined>>
		| Record<string, string | string[] | undefined>;
};

const decodeModelIdFromUrl = (value: string): string => {
	const trimmed = value?.trim();
	if (!trimmed) return "";
	if (trimmed.includes("/")) return trimmed;
	if (!trimmed.includes("_")) return trimmed;
	const [organisationId, ...rest] = trimmed.split("_");
	if (!organisationId || rest.length === 0) return trimmed;
	return `${organisationId}/${rest.join("_")}`;
};

const normalizeSelection = (value: string | string[] | undefined): string[] => {
	if (!value) return [];
	if (Array.isArray(value)) return value.filter(Boolean);
	return [value];
};

const average = (values: Array<number | null | undefined>): number | null => {
	const normalized = values.filter(
		(value): value is number => value != null && Number.isFinite(value)
	);
	if (!normalized.length) return null;
	return normalized.reduce((sum, value) => sum + value, 0) / normalized.length;
};

export default async function Page({ searchParams }: PageProps = {}) {
	const includeHidden = false;
	const [models, resolvedSearchParams] = await Promise.all([
		loadCompareModelsCached(includeHidden),
		searchParams,
	]);
	const typedModels = models as ExtendedModel[];
	const selection = normalizeSelection(resolvedSearchParams?.models).map(
		decodeModelIdFromUrl
	);

	const lookup = new Map<string, string>();
	typedModels.forEach((model) => {
		if (!model.id) return;
		lookup.set(model.id, model.id);
	});

	const resolvedIds = selection
		.map((value) => lookup.get(value) ?? value)
		.filter((value): value is string => Boolean(value));

	const [comparisonData, usageByModel] = resolvedIds.length
		? await Promise.all([
				getComparisonModelsCached(resolvedIds, includeHidden),
				Promise.all(
					resolvedIds.map(async (id) => {
						try {
							const [metrics, trajectory, realtime30m] = await Promise.all([
								getModelPerformanceMetricsCached(id, includeHidden),
								getModelTokenTrajectoryCached(id, includeHidden),
								getModelRealtimeWindowStatsCached(id, 30),
							]);
							const points30d = (trajectory?.points ?? [])
								.slice(-30)
								.map((point: ModelTokenTrajectoryPoint) => ({
									date: point.date,
									value: Number(point.tokens ?? 0),
								}));
							const tokens30d = points30d.reduce(
								(sum: number, point: { value: number }) =>
									sum + (Number.isFinite(point.value) ? point.value : 0),
								0
							);
							const latestDate = points30d.length
								? points30d[points30d.length - 1].date
								: null;
							const fallbackLatencyMs =
								metrics.summary.avgLatencyMs ??
								average(
									metrics.hourly.map(
										(point: ModelPerformancePoint) => point.avgLatencyMs
									)
								) ??
								average(
									metrics.timeOfDay.map(
										(point: ModelTimeOfDayPoint) => point.avgLatencyMs
									)
								) ??
								average(
									metrics.providerPerformance.map(
										(provider: ModelProviderPerformance) =>
											provider.avgLatencyMs
									)
								) ??
								average(
									metrics.providerDaily7d.map(
										(point: ModelProviderDailyPoint) => point.avgLatencyMs
									)
								);
							const fallbackThroughput =
								metrics.summary.avgThroughput ??
								average(
									metrics.hourly.map(
										(point: ModelPerformancePoint) => point.avgThroughput
									)
								) ??
								average(
									metrics.timeOfDay.map(
										(point: ModelTimeOfDayPoint) => point.avgThroughput
									)
								) ??
								average(
									metrics.providerPerformance.map(
										(provider: ModelProviderPerformance) =>
											provider.avgThroughput
									)
								) ??
								average(
									metrics.providerDaily7d.map(
										(point: ModelProviderDailyPoint) => point.avgThroughput
									)
								);
							return [
								id,
								{
									periodDays: 30,
									tokens30d,
									latestDate,
									points30d,
									totalRequests: metrics.summary.totalRequests,
									requests30m: realtime30m.requestsInWindow,
									latencyP50Ms30m:
										realtime30m.latencyP50Ms ?? fallbackLatencyMs ?? null,
									throughputP50TokPerSec30m:
										realtime30m.throughputP50TokPerSec ?? fallbackThroughput ?? null,
									cumulativeTokens: metrics.cumulativeTokens ?? null,
									requestPoints24h: metrics.hourly.map((point: ModelPerformancePoint) => ({
										date: point.bucket,
										value: point.requests,
									})),
								},
							] as const;
						} catch (error) {
							console.warn("[compare] Failed to load gateway usage for model", {
								modelId: id,
								error,
							});
							return null;
						}
					})
				).then((entries) =>
					Object.fromEntries(entries.filter(Boolean) as Array<[string, CompareGatewayUsageByModel[string]]>)
				),
			])
		: [[], {}];

	return (
		<main className="flex min-h-screen flex-col">
			<CompareMiniHeader models={typedModels} />
			<section className="container mx-auto px-4 py-8">
				<CompareDashboard
					models={typedModels}
					comparisonData={comparisonData}
					usageByModel={usageByModel}
				/>
			</section>
		</main>
	);
}
