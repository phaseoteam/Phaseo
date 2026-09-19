// app/(dashboard)/rankings/RankingsPageContent.tsx
// Purpose: Public rankings page showing AI model usage statistics
// Why: Provides transparency and insights into model usage across the gateway
// How: Server component that fetches data and renders visualizations

import { Suspense } from "react";
import { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { MarketShareStackedBar } from "@/components/(rankings)/MarketShareStackedBar";
import { MarketShareLeaderboard } from "@/components/(rankings)/MarketShareLeaderboard";
import { UsageStackedBar } from "@/components/(rankings)/UsageStackedBar";
import { RankingBarTable } from "@/components/(rankings)/RankingBarTable";
import { PublicGeography } from "@/components/(rankings)/PublicGeography";
import { ToolCallsSection } from "@/components/(rankings)/ToolCallsSection";
import { BenchmarkRankingsSectionServer } from "@/components/(rankings)/BenchmarkRankingsSectionServer";
import { ContextLengthSection } from "@/components/(rankings)/ContextLengthSection";
import { ImageInputsSection } from "@/components/(rankings)/ImageInputsSection";
import { ModelRetentionSection } from "@/components/(rankings)/ModelRetentionSection";
import { TopAppsSection } from "@/components/(rankings)/TopAppsSection";
import {
	ModalityLeaderboards,
	type ModalityLeaderboardEntry,
	type ModalitySectionData,
} from "@/components/(rankings)/ModalityLeaderboards";
import { RankingsModalityTabs } from "@/components/(rankings)/RankingsModalityTabs";
import ModelPageToc, {
	type ModelPageTocItem,
} from "@/components/(data)/model/ModelPageToc";
import { ChartSkeleton, ListSkeleton } from "@/components/(rankings)/Skeletons";
import { InlineInfoTooltip } from "@/components/(rankings)/InlineInfoTooltip";
import {
    fetchFrontendMarketShare,
    fetchFrontendMarketShareTimeseries,
    fetchFrontendModelLeaderboardMetaByIds,
    fetchFrontendOrganisationLogoIdsByNames,
    fetchFrontendProviderNamesByIds,
    fetchFrontendRankingModalityTimeseries,
    fetchFrontendRankingsIndexability,
    fetchFrontendRankingUniqueUserTimeseries,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";
import {
	fetchFrontendRankingFastestModels,
} from "@/lib/fetchers/frontend/fetchRankingSections";
import type {
	TimeseriesData,
	PerformanceData,
} from "@/lib/fetchers/rankings/getRankingsData";
import { modalityMetrics, secondaryModalityMetrics } from "@/lib/fetchers/rankings/modalityMetrics";
import { RankingUnavailable } from "@/components/(rankings)/RankingUnavailable";
import { formatModelDisplayName } from "@/lib/models/displayName";

export type RankingModality =
	| "text"
	| "image"
	| "embeddings"
	| "rerank"
	| "audio"
	| "video"
	| "speech"
	| "transcription";

export const RANKING_MODALITIES: RankingModality[] = ["text", "image", "embeddings", "rerank", "audio", "video", "speech", "transcription"];

const rankingSectionLabels: Record<RankingModality, string> = {
	text: "AI Model Rankings",
	image: "Image Model Rankings",
	embeddings: "Embedding Model Rankings",
	rerank: "Rerank Model Rankings",
	audio: "Audio Model Rankings",
	video: "Video Model Rankings",
	speech: "Speech Model Rankings",
	transcription: "Transcription Model Rankings",
};

const textRankingTocItems: ModelPageTocItem[] = [
	{ id: "text", label: "Leaderboard" },
	{ id: "fastest-models", label: "Fastest Models" },
	{ id: "benchmarks", label: "Benchmarks" },
	{ id: "context-length", label: "Context Length" },
	{ id: "unique-users", label: "Unique Users" },
	{ id: "retention", label: "Return Rate" },
	{ id: "market-share", label: "Market Share" },
	{ id: "tool-calls", label: "Tool Calls" },
	{ id: "image-inputs", label: "Image Inputs" },
	{ id: "top-apps", label: "Top Apps" },
	{ id: "geography", label: "Countries" },
];

export function isRankingModality(value: string): value is RankingModality {
	return RANKING_MODALITIES.includes(value as RankingModality);
}

export async function generateRankingsMetadata(): Promise<Metadata> {
	const indexability = await fetchFrontendRankingsIndexability().catch(() => ({
		shouldIndex: false,
	}));

	return buildMetadata({
		title: "Rankings",
		description:
			"Compare AI models across gateway usage, effective pricing, caching value, benchmark scores, value metrics, latency, throughput and provider breakdowns.",
		path: "/rankings",
		keywords: [
			"AI model rankings",
			"AI model leaderboards",
			"LLM rankings",
			"AI benchmark leaderboard",
			"AI model pricing",
			"model latency",
			"model throughput",
			"AI usage statistics",
		],
		openGraph: {
			title: "AI Model Leaderboards on Phaseo",
			description:
				"Compare AI models by usage, price, caching value, benchmark scores, latency, throughput and provider breakdowns.",
		},
		robots: indexability.shouldIndex
			? { index: true, follow: true }
			: { index: false, follow: true },
	});
}

export default async function RankingsPageContent({
	modality = "text",
}: {
	modality?: RankingModality;
}) {
	const isTextPage = modality === "text";
	const tocItems = isTextPage
		? textRankingTocItems
		: [{ id: modality, label: rankingSectionLabels[modality] }];

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="mx-auto max-w-[1680px] px-4 pb-8 pt-0 sm:px-6 lg:px-10">
				<div className="sticky top-[calc(var(--site-notice-height,0px)+var(--site-header-height,3.75rem))] z-20 -mx-4 mb-4 border-b border-border/70 bg-background px-4 py-2 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
					<RankingsModalityTabs currentModality={modality} />
				</div>
				<div className="flex flex-col gap-8 lg:flex-row lg:items-start">
					<ModelPageToc
						items={tocItems}
						className="lg:h-full lg:w-max lg:shrink-0"
					/>
					<main className="min-w-0 flex-1 space-y-16">
                    <Suspense fallback={<ListSkeleton />}>
                        <ModalityLeaderboardsServer modality={modality} />
                    </Suspense>

                    {isTextPage ? (
                    <>
					<Suspense fallback={<ListSkeleton />}>
						<TextRankingSignalsServer />
					</Suspense>
					<Suspense fallback={<ListSkeleton />}>
						<BenchmarkRankingsSectionServer />
					</Suspense>

					<Suspense fallback={<ListSkeleton />}>
						<ContextLengthSection />
					</Suspense>

                    <Suspense fallback={<ChartSkeleton />}>
                        <UniqueUsersSectionServer />
                    </Suspense>

					<Suspense fallback={<ListSkeleton />}>
						<ModelRetentionSection />
					</Suspense>

                    <section id="market-share" className="scroll-mt-32 space-y-12 border-t border-border pt-12">
						<div className="space-y-0.5">
							<h2 className="text-2xl font-semibold leading-8">Market Share</h2>
							<p className="max-w-3xl text-sm text-muted-foreground">
								How gateway usage is distributed across model creators and API providers.
							</p>
						</div>
                        <section className="space-y-4">
                            <div className="space-y-0.5">
                                <h3 className="text-xl font-semibold leading-8">Market Share by Organization</h3>
                                <p className="text-sm text-muted-foreground">
                                    <span className="inline-flex items-center gap-1.5">
                                        Weekly organization share trends across the gateway.
                                        <InlineInfoTooltip
                                            label="What is an organization?"
                                            description="An organization is the model creator or lab, such as OpenAI, Anthropic, or Google."
                                        />
                                    </span>
                                </p>
                            </div>
                            <Suspense fallback={<ChartSkeleton />}>
                                <MarketShareOrganizationServer />
                            </Suspense>
                        </section>
                        <section className="space-y-4">
                            <div className="space-y-0.5">
                                <h3 className="text-xl font-semibold leading-8">Market Share by Provider</h3>
                                <p className="text-sm text-muted-foreground">
                                    <span className="inline-flex items-center gap-1.5">
                                        Weekly provider share trends across routed traffic.
                                        <InlineInfoTooltip
                                            label="What is a provider?"
                                            description="A provider is the API endpoint serving requests for a model, such as OpenAI API, Azure OpenAI, or Together."
                                        />
                                    </span>
                                </p>
                            </div>
                            <Suspense fallback={<ChartSkeleton />}>
                            <MarketShareProviderServer />
                        </Suspense>
                        </section>
                    </section>

					<Suspense fallback={<ChartSkeleton />}>
						<ToolCallsSection />
					</Suspense>

					<Suspense fallback={<ChartSkeleton />}>
						<ImageInputsSection />
					</Suspense>

					<Suspense fallback={<ListSkeleton />}>
						<TopAppsSection />
					</Suspense>

					<Suspense fallback={<ListSkeleton />}>
						<PublicGeography />
					</Suspense>
                    </>
                    ) : null}

					</main>
				</div>
            </div>
        </div>
    );
}

// Server components for data fetching

function formatTokens(value: number) {
	if (!Number.isFinite(value)) return "--";
	if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
	if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
	if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
	return value.toLocaleString();
}

function metadataFor(
	modelId: string,
	metaMap: Record<string, { name: string | null; organisation_id: string | null; organisation_name: string | null }>,
) {
	const meta = metaMap[modelId] ?? null;
	return {
		model_name: formatModelDisplayName(meta?.name, modelId),
		organisation_id: meta?.organisation_id ?? null,
		organisation_name: meta?.organisation_name ?? null,
	};
}

function formatCount(value: number, unit: string) {
	const formatted = formatTokens(value);
	return `${formatted} ${unit}`;
}

function buildPerformanceEntries(
	rows: PerformanceData[],
	metric: "median_throughput" | "median_latency_ms",
	metaMap: Record<string, { name: string | null; organisation_id: string | null; organisation_name: string | null }>,
	providerNames: Record<string, string>,
): ModalityLeaderboardEntry[] {
	const lowerIsBetter = metric === "median_latency_ms";
	return rows
		.map((row): ModalityLeaderboardEntry | null => {
			const value = Number(row[metric] ?? 0);
			if (
				!row.model_id ||
				!row.provider ||
				!Number.isFinite(value) ||
				value <= 0 ||
				Number(row.requests ?? 0) <= 0
			) {
				return null;
			}
			const meta = metadataFor(row.model_id, metaMap);
			return {
				key: `${metric}:${row.model_id}:${row.provider}`,
				model_id: row.model_id,
				...meta,
				provider_id: row.provider,
				provider_name: providerNames[row.provider] ?? row.provider,
				value,
				value_label:
					metric === "median_throughput"
						? `${value.toFixed(1)} tok/s`
						: `${value.toFixed(0)} ms`,
				secondary: `${Number(row.requests ?? 0).toLocaleString()} recent requests`,
				tertiary:
					metric === "median_throughput"
						? Number(row.median_latency_ms ?? 0) > 0
							? `${Number(row.median_latency_ms).toFixed(0)} ms median latency`
							: null
						: Number(row.median_throughput ?? 0) > 0
							? `${Number(row.median_throughput).toFixed(1)} tok/s`
							: null,
				lowerIsBetter,
			};
		})
		.filter((entry): entry is ModalityLeaderboardEntry => entry !== null)
		.sort((left, right) =>
			lowerIsBetter ? left.value - right.value : right.value - left.value,
		)
		.slice(0, 20)
		.map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export async function ModalityLeaderboardsServer({ modality }: { modality: RankingModality }) {
	const primary = modalityMetrics[modality];
	const secondary = secondaryModalityMetrics[modality];
	const [series, monthly, secondaryMonthly] = await Promise.all([
		fetchFrontendRankingModalityTimeseries(primary.metric, "year").catch(() => null),
		fetchFrontendRankingModalityTimeseries(primary.metric, "month").catch(() => null),
		secondary ? fetchFrontendRankingModalityTimeseries(secondary.metric, "month").catch(() => null) : null,
	]);
	const modelIds = [...new Set([...(series?.data ?? []), ...(monthly?.data ?? []), ...(secondaryMonthly?.data ?? [])]
		.map((row) => row.model_id).filter((id) => id && !["other", "unknown"].includes(id.toLowerCase())))];
	const metaMap = await fetchFrontendModelLeaderboardMetaByIds(modelIds).catch(
		(): Awaited<ReturnType<typeof fetchFrontendModelLeaderboardMetaByIds>> => ({}),
	);
	const nameMap = Object.fromEntries(modelIds.map((id) => [id, formatModelDisplayName(metaMap[id]?.name, id)]));
	const logoIdMap = Object.fromEntries(modelIds.map((id) => [id, metaMap[id]?.organisation_id ?? id]));
	const organisationNameMap = Object.fromEntries(modelIds.map((id) => [id, metaMap[id]?.organisation_name ?? null]));
	const entries = (rows: TimeseriesData[], unit: string): ModalityLeaderboardEntry[] => {
		const totals = new Map<string, number>();
		for (const row of rows) {
			if (!modelIds.includes(row.model_id)) continue;
			const value = Number(row.tokens);
			if (Number.isFinite(value) && value > 0) totals.set(row.model_id, (totals.get(row.model_id) ?? 0) + value);
		}
		return [...totals].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([id, value], index) => ({
			key: id, model_id: id, ...metadataFor(id, metaMap), value,
			value_label: formatCount(value, unit), rank: index + 1,
			secondary: "Over the last 30 days",
		}));
	};
	const section: ModalitySectionData = {
		id: modality, label: modality === "text" ? "Text" : rankingSectionLabels[modality].split(" ")[0],
		title: rankingSectionLabels[modality], description: "Based on observed Phaseo gateway usage.",
		chartTitle: primary.title, chartDescription: "Weekly usage by model · UTC", valueUnit: primary.unit,
		primaryTimeseries: series?.data ?? [], primaryEntries: [], unavailable: series === null,
		metrics: [
			{ id: primary.metric, title: primary.title, description: "Over the last 30 days", entries: entries(monthly?.data ?? [], primary.unit), unavailable: monthly === null },
			...(secondary ? [{ id: secondary.metric, title: secondary.title, description: "Over the last 30 days", entries: entries(secondaryMonthly?.data ?? [], secondary.unit), unavailable: secondaryMonthly === null }] : []),
		],
	};
	return <ModalityLeaderboards sections={[section]} nameMap={nameMap} logoIdMap={logoIdMap} organisationNameMap={organisationNameMap} />;
}

async function TextRankingSignalsServer() {
	const result = await fetchFrontendRankingFastestModels(30, 100).catch(() => null);
	if (!result) return <RankingUnavailable id="fastest-models" title="Fastest Models" />;
	const [metaMap, providerNames] = await Promise.all([
		fetchFrontendModelLeaderboardMetaByIds([...new Set(result.data.map((row) => row.model_id))]).catch(() => ({})),
		fetchFrontendProviderNamesByIds([...new Set(result.data.map((row) => row.provider))]).catch(() => ({})),
	]);
	return <TextRankingSignals
		throughputEntries={buildPerformanceEntries(result.data, "median_throughput", metaMap, providerNames)}
		latencyEntries={buildPerformanceEntries(result.data, "median_latency_ms", metaMap, providerNames)}
	/>;
}

function TextRankingSignals({
	throughputEntries,
	latencyEntries,
}: {
	throughputEntries: ModalityLeaderboardEntry[];
	latencyEntries: ModalityLeaderboardEntry[];
}) {
	return (
		<div className="space-y-16">
			<section
				id="fastest-models"
				className="scroll-mt-32 space-y-6 border-t border-border pt-12"
			>
				<span id="performance" className="sr-only" aria-hidden="true" />
				<div className="space-y-0.5">
					<h2 className="text-2xl font-semibold leading-8">Fastest Models</h2>
					<p className="max-w-3xl text-sm text-muted-foreground">
						Recent production performance across routes with sufficient public samples.
					</p>
				</div>
				<div className="grid gap-12 xl:grid-cols-2 xl:gap-16">
					<RankingBarTable
						title="Fastest Generation"
						description="Highest median output throughput over the last 30 days."
						entries={throughputEntries}
					/>
					<RankingBarTable
						title="Lowest Latency"
						description="Lowest median response latency over the last 30 days."
						entries={latencyEntries}
						lowerIsBetter
					/>
				</div>
			</section>
		</div>
	);
}

async function UniqueUsersSectionServer() {
	const result = await fetchFrontendRankingUniqueUserTimeseries("year", "week", 10).catch(() => null);
	if (!result) return <RankingUnavailable id="unique-users" title="Unique Users" />;
	const modelIds = Array.from(
		new Set(
			result.data
				.map((row) => row.model_id)
				.filter((id) => id && id.toLowerCase() !== "other" && id.toLowerCase() !== "unknown"),
		),
	);
	const metaMap = await fetchFrontendModelLeaderboardMetaByIds(modelIds).catch(
		(): Awaited<ReturnType<typeof fetchFrontendModelLeaderboardMetaByIds>> => ({}),
	);
	const nameMap = Object.fromEntries(
		modelIds.map((modelId) => [
			modelId,
			formatModelDisplayName(metaMap[modelId]?.name, modelId),
		]),
	);
	const logoIdMap = Object.fromEntries(
		modelIds.map((modelId) => [
			modelId,
			metaMap[modelId]?.organisation_id ?? modelId,
		]),
	);
	const organisationNameMap = Object.fromEntries(
		modelIds.flatMap((modelId) => {
			const meta = metaMap[modelId] ?? null;
			return [
				[modelId, meta?.organisation_name ?? meta?.organisation_id ?? null],
				...(meta?.organisation_id
					? [[meta.organisation_id, meta.organisation_name ?? meta.organisation_id]]
					: []),
			];
		}),
	);
	const modelLicenseMap = Object.fromEntries(
		modelIds.map((modelId) => [
			modelId,
			metaMap[modelId]?.license ?? null,
		]),
	);

	return (
		<section id="unique-users" className="scroll-mt-32 space-y-4 border-t border-border pt-12">
			<div className="space-y-0.5">
				<h2 className="text-2xl font-semibold leading-8">Unique Users</h2>
				<p className="max-w-3xl text-sm text-muted-foreground">
					Model adoption by distinct gateway actors, so token-heavy workloads do not dominate the ranking alone.
				</p>
			</div>
			<UsageStackedBar
				data={result.data}
				leaderboardData={result.data}
				metric="users"
				nameMap={nameMap}
				logoIdMap={logoIdMap}
				organisationNameMap={organisationNameMap}
				modelLicenseMap={modelLicenseMap}
				leaderboardTitle="Unique Users Leaderboard"
				leaderboardDescription="Compare models by distinct people or workspaces using them across the selected usage period."
				valueUnit="users"
			/>
		</section>
	);
}

async function MarketShareOrganizationServer() {
    const [timeseriesResult, leaderboardResult] = await Promise.all([
        fetchFrontendMarketShareTimeseries("organization", "year", "week", 10).catch(() => null),
        fetchFrontendMarketShare("organization", "year").catch(() => null),
    ]);
    if (!timeseriesResult || !leaderboardResult) return <RankingUnavailable title="Market Share by Organization" />;

    const organisationNames = Array.from(
        new Set(
            (leaderboardResult.data ?? [])
                .map((row) => row.name)
                .filter((name) => name && name.toLowerCase() !== "unknown")
        )
    );
    const logoMap = await fetchFrontendOrganisationLogoIdsByNames(organisationNames).catch(
        (): Record<string, string> => ({}),
    );

    const chartData = (timeseriesResult.data ?? []).filter(
        (row) => row.name && row.name.toLowerCase() !== "unknown"
    );

    const filtered = (leaderboardResult.data ?? []).filter(
        (row) =>
            row.name &&
            row.name.toLowerCase() !== "unknown" &&
            Number(row.tokens ?? 0) > 0
    );
    const totalTokens = filtered.reduce(
        (sum, row) => sum + Number(row.tokens ?? 0),
        0
    );
    const entries = filtered
        .map((row) => ({
            key: row.name,
            name: row.name,
            logo_id: logoMap[row.name] ?? null,
            href: logoMap[row.name]
                ? `/organisations/${encodeURIComponent(logoMap[row.name])}`
                : null,
            tokens: Number(row.tokens ?? 0),
            share_pct:
                totalTokens > 0
                    ? (Number(row.tokens ?? 0) / totalTokens) * 100
                    : 0,
        }))
        .sort((a, b) => b.tokens - a.tokens)
        .slice(0, 20);

    return (
        <>
            <MarketShareStackedBar
                data={chartData}
                dimension="organization"
                metric="tokens"
                normalizeToPercent
            />
            <MarketShareLeaderboard data={entries} maxCollapsed={10} maxExpanded={20} />
        </>
    );
}

async function MarketShareProviderServer() {
    const [timeseriesResult, leaderboardResult] = await Promise.all([
        fetchFrontendMarketShareTimeseries("provider", "year", "week", 10).catch(() => null),
        fetchFrontendMarketShare("provider", "year").catch(() => null),
    ]);
    if (!timeseriesResult || !leaderboardResult) return <RankingUnavailable title="Market Share by Provider" />;

    const providerIds = Array.from(
        new Set(
            [...(timeseriesResult.data ?? []), ...(leaderboardResult.data ?? [])]
                .map((row) => row.name)
                .filter(
                    (id) =>
                        id &&
                        id.toLowerCase() !== "unknown" &&
                        id.toLowerCase() !== "other"
                )
        )
    );
    const providerNameMap = await fetchFrontendProviderNamesByIds(providerIds).catch(
        (): Record<string, string> => ({}),
    );

    const chartData = (timeseriesResult.data ?? [])
        .filter((row) => row.name && row.name.toLowerCase() !== "unknown")
        .map((row) => ({
            ...row,
            name: row.name === "Other" ? "Other" : providerNameMap[row.name] ?? row.name,
        }));

    const filtered = (leaderboardResult.data ?? [])
        .filter(
            (row) =>
                row.name &&
                row.name.toLowerCase() !== "unknown" &&
                row.name.toLowerCase() !== "other" &&
                Number(row.tokens ?? 0) > 0
        )
        .map((row) => ({
            ...row,
            display_name: providerNameMap[row.name] ?? row.name,
        }));
    const totalTokens = filtered.reduce(
        (sum, row) => sum + Number(row.tokens ?? 0),
        0
    );
    const entries = filtered
        .map((row) => ({
            key: row.name,
            name: row.display_name,
            logo_id: row.name,
            href: `/api-providers/${encodeURIComponent(row.name)}`,
            tokens: Number(row.tokens ?? 0),
            share_pct:
                totalTokens > 0
                    ? (Number(row.tokens ?? 0) / totalTokens) * 100
                    : 0,
        }))
        .sort((a, b) => b.tokens - a.tokens)
        .slice(0, 20);

    return (
        <>
            <MarketShareStackedBar
                data={chartData}
                dimension="provider"
                metric="tokens"
                normalizeToPercent
            />
            <MarketShareLeaderboard data={entries} maxCollapsed={10} maxExpanded={20} />
        </>
    );
}
