import type { Metadata } from "next";

import { buildMetadata } from "@/lib/seo";
import type { ExtendedModel } from "@/data/types";
import {
	fetchFrontendCompareModels,
	fetchFrontendComparisonModels,
	fetchFrontendModelPerformance,
	fetchFrontendModelRealtimeWindowStats,
	fetchFrontendModelTokenTrajectory,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";
import CompareDashboard from "@/components/(data)/compare/CompareDashboard";
import type { CompareGatewayUsageByModel } from "@/components/(data)/compare/types";

export const metadata: Metadata = buildMetadata({
	title: "Compare Models",
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
		"Phaseo",
	],
	imagePath: "/compare/opengraph-image",
	imageAlt: "Phaseo model comparison preview",
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
	const [models, resolvedSearchParams] = await Promise.all([
		fetchFrontendCompareModels(),
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
				fetchFrontendComparisonModels(resolvedIds),
				Promise.all(
					resolvedIds.map(async (id) => {
						try {
							const [metrics, trajectory, realtime30m] = await Promise.all([
								fetchFrontendModelPerformance(id),
								fetchFrontendModelTokenTrajectory(id),
								fetchFrontendModelRealtimeWindowStats(id, 30),
							]);
							const points30d = (trajectory?.points ?? [])
								.slice(-30)
								.map((point) => ({
									date: point.date,
									value: Number(point.tokens ?? 0),
								}));
							const tokens30d = points30d.reduce(
								(sum, point) => sum + (Number.isFinite(point.value) ? point.value : 0),
								0
							);
							const latestDate = points30d.length
								? points30d[points30d.length - 1].date
								: null;
							const summary = metrics?.summary ?? null;
							const hourly = metrics?.hourly ?? [];
							const timeOfDay = metrics?.timeOfDay ?? [];
							const providerPerformance = metrics?.providerPerformance ?? [];
							const providerDaily7d = metrics?.providerDaily7d ?? [];
							const fallbackLatencyMs =
								summary?.avgLatencyMs ??
								average(hourly.map((point) => point.avgLatencyMs)) ??
								average(timeOfDay.map((point) => point.avgLatencyMs)) ??
								average(
									providerPerformance.map((provider) => provider.avgLatencyMs)
								) ??
								average(providerDaily7d.map((point) => point.avgLatencyMs));
							const fallbackThroughput =
								summary?.avgThroughput ??
								average(hourly.map((point) => point.avgThroughput)) ??
								average(timeOfDay.map((point) => point.avgThroughput)) ??
								average(
									providerPerformance.map((provider) => provider.avgThroughput)
								) ??
								average(providerDaily7d.map((point) => point.avgThroughput));
							return [
								id,
								{
									periodDays: 30,
									tokens30d,
									latestDate,
									points30d,
									totalRequests: summary?.totalRequests ?? 0,
									requests30m: realtime30m?.requestsInWindow ?? 0,
									latencyP50Ms30m:
										realtime30m?.latencyP50Ms ?? fallbackLatencyMs ?? null,
									throughputP50TokPerSec30m:
										realtime30m?.throughputP50TokPerSec ?? fallbackThroughput ?? null,
									cumulativeTokens: metrics?.cumulativeTokens ?? null,
									requestPoints24h: hourly.map((point) => ({
										date: point.bucket,
										value: point.requests,
									})),
								},
							] as const;
						} catch (error) {
							// eslint-disable-next-line no-console
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
