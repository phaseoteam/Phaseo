import type { Metadata } from "next";

import { Suspense } from "react";

import { getLocale, getTranslations } from "next-intl/server";
import { buildLocalizedPageMetadata } from "@/lib/auth/localized-metadata";
import type { ExtendedModel } from "@/data/types";
import {
	fetchFrontendCompareModels,
	fetchFrontendCompareUsage,
	fetchFrontendComparisonModels,
	fetchFrontendModelPerformance,
	fetchFrontendModelRealtimeWindowStats,
	fetchFrontendModelTokenTrajectory,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";
import CompareDashboard from "@/components/(data)/compare/CompareDashboard";
import type { CompareGatewayUsageByModel } from "@/components/(data)/compare/types";

export async function generateMetadata(): Promise<Metadata> {
	const locale = await getLocale();
	const t = await getTranslations("Catalogue.compare");
	return buildLocalizedPageMetadata({
		locale: locale as never,
		pathname: "/compare",
		title: t("title"),
		description: t("description"),
		keywords: ["AI model comparison", "compare AI models", "AI benchmarks", "AI model pricing", "Phaseo"],
		openGraph: { type: "website" },
	});
}

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

async function loadLegacyUsage(modelIds: string[]): Promise<CompareGatewayUsageByModel> {
	const entries = await Promise.all(modelIds.map(async (id) => {
		try {
			const [metrics, trajectory, realtime30m] = await Promise.all([
				fetchFrontendModelPerformance(id),
				fetchFrontendModelTokenTrajectory(id),
				fetchFrontendModelRealtimeWindowStats(id, 30),
			]);
			const points30d = (trajectory?.points ?? []).slice(-30).map((point) => ({ date: point.date, value: Number(point.tokens ?? 0) }));
			const summary = metrics?.summary ?? null;
			const hourly = metrics?.hourly ?? [];
			const timeOfDay = metrics?.timeOfDay ?? [];
			const providerPerformance = metrics?.providerPerformance ?? [];
			const providerDaily7d = metrics?.providerDaily7d ?? [];
			const fallbackLatencyMs = summary?.avgLatencyMs ?? average(hourly.map((point) => point.avgLatencyMs)) ?? average(timeOfDay.map((point) => point.avgLatencyMs)) ?? average(providerPerformance.map((provider) => provider.avgLatencyMs)) ?? average(providerDaily7d.map((point) => point.avgLatencyMs));
			const fallbackThroughput = summary?.avgThroughput ?? average(hourly.map((point) => point.avgThroughput)) ?? average(timeOfDay.map((point) => point.avgThroughput)) ?? average(providerPerformance.map((provider) => provider.avgThroughput)) ?? average(providerDaily7d.map((point) => point.avgThroughput));
			return [id, {
				periodDays: 30,
				tokens30d: points30d.reduce((sum, point) => sum + (Number.isFinite(point.value) ? point.value : 0), 0),
				latestDate: points30d.at(-1)?.date ?? null,
				points30d,
				totalRequests: summary?.totalRequests ?? 0,
				requests30m: realtime30m?.requestsInWindow ?? 0,
				latencyP50Ms30m: realtime30m?.latencyP50Ms ?? fallbackLatencyMs ?? null,
				throughputP50TokPerSec30m: realtime30m?.throughputP50TokPerSec ?? fallbackThroughput ?? null,
				cumulativeTokens: metrics?.cumulativeTokens ?? null,
				requestPoints24h: hourly.map((point) => ({ date: point.bucket, value: point.requests })),
			}] as const;
		} catch (error) {
			// eslint-disable-next-line no-console
			console.warn("[compare] Failed to load gateway usage for model", { modelId: id, error });
			return null;
		}
	}));
	return Object.fromEntries(entries.filter(Boolean) as Array<[string, CompareGatewayUsageByModel[string]]>);
}

function CompareDashboardFallback() {
	return (
		<div className="w-full">
			<div className="sticky top-[var(--site-header-height,4rem)] border-b bg-background/90">
				<div className="mx-auto w-full max-w-6xl px-4 py-2 sm:py-3">
					<div className="h-5 w-20 animate-pulse rounded bg-muted/50" />
					<div className="mt-2 h-7 w-24 animate-pulse rounded-md bg-muted/40" />
				</div>
			</div>
			<div className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8">
				<div className="h-9 w-64 animate-pulse rounded-md bg-muted/50" />
				<div className="mt-3 h-5 w-full max-w-xl animate-pulse rounded bg-muted/40" />
				<div className="mt-8 grid gap-3 sm:grid-cols-2">
					<div className="h-14 animate-pulse rounded-xl border border-dashed border-border/70 bg-muted/20" />
					<div className="h-14 animate-pulse rounded-xl border border-dashed border-border/70 bg-muted/20" />
				</div>
			</div>
		</div>
	);
}

async function ComparePageContent({ searchParams }: PageProps) {
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
				fetchFrontendCompareUsage(resolvedIds).catch((error) => {
					// eslint-disable-next-line no-console
					console.warn("[compare] Batch usage unavailable; using compatibility requests", error);
					return loadLegacyUsage(resolvedIds);
				}),
			])
		: [[], {}];

	return (
		<CompareDashboard
			models={typedModels}
			comparisonData={comparisonData}
			usageByModel={usageByModel}
		/>
	);
}

export default function Page({ searchParams }: PageProps = {}) {
	return (
		<main className="flex min-h-screen flex-col">
			<section className="w-full">
				<Suspense fallback={<CompareDashboardFallback />}>
					<ComparePageContent searchParams={searchParams} />
				</Suspense>
			</section>
		</main>
	);
}
