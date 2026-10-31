// features/rankings/RankingsPageContent.tsx
// Purpose: Public rankings page showing AI model usage statistics
// Why: Provides transparency and insights into model usage across the gateway
// How: Reads the rankings queries and renders the visualisations

import { formatLatency, formatTps } from "@phaseo/app-kit/format";
import { Suspense } from "react";
import { formatRoundedCount } from "@/lib/formatRoundedCount";
import { PageMetadata } from "@/lib/seo/metadataTypes";
import { buildLocalizedPageMetadata } from "@/lib/auth/localized-metadata";
import type { PublicLocale } from "@/i18n/routing";
import { MarketShareStackedBar } from "@/components/(rankings)/MarketShareStackedBar";
import { MarketShareLeaderboard } from "@/components/(rankings)/MarketShareLeaderboard";
import { UsageStackedBar } from "@/components/(rankings)/UsageStackedBar";
import { RankingBarTable } from "@/components/(rankings)/RankingBarTable";
import { PublicGeography } from "@/components/(rankings)/PublicGeography";
import { ToolCallsSection } from "@/components/(rankings)/ToolCallsSection";
import { LazyRenderOnVisible } from "@/components/(rankings)/LazyRenderOnVisible";
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
import ModelPageToc from "@/components/(data)/model/ModelPageToc";
import { ChartSkeleton, ListSkeleton } from "@/components/(rankings)/Skeletons";
import { InlineInfoTooltip } from "@/components/(rankings)/InlineInfoTooltip";
import { fetchFrontendRankingsIndexability } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import type {
	PerformanceData,
} from "@/lib/fetchers/rankings/getRankingsData";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "@/i18n/react";
import {
	fastestModelsQuery,
	marketShareOrganizationQuery,
	marketShareProviderQuery,
	modalityLeaderboardsQuery,
	uniqueUsersQuery,
} from "./RankingsPageContent.queries";
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

const rankingSectionLabelKeys: Record<RankingModality, string> = {
	text: "modalityTitles.text",
	image: "modalityTitles.image",
	embeddings: "modalityTitles.embeddings",
	rerank: "modalityTitles.rerank",
	audio: "modalityTitles.audio",
	video: "modalityTitles.video",
	speech: "modalityTitles.speech",
	transcription: "modalityTitles.transcription",
};

export function isRankingModality(value: string): value is RankingModality {
	return RANKING_MODALITIES.includes(value as RankingModality);
}

export async function getRankingsMetadata(): Promise<PageMetadata> {
	// Metadata runs on the server only; keep @/i18n/server out of the component graph.
	const { getLocale, getTranslations } = await import("@/i18n/server");
	const locale = await getLocale();
	const t = await getTranslations("Catalogue.rankings");
	const indexability = await fetchFrontendRankingsIndexability().catch(() => ({
		shouldIndex: false,
	}));

	return buildLocalizedPageMetadata({
		locale: locale as PublicLocale,
		pathname: "/rankings",
		title: t("title"),
		description: t("description"),
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
		openGraph: { title: t("title"), description: t("description") },
		robots: indexability.shouldIndex
			? { index: true, follow: true }
			: { index: false, follow: true },
	});
}

export default function RankingsPageContent({
	modality = "text",
}: {
	modality?: RankingModality;
}) {
	const t = useTranslations("Catalogue.rankings");
	const translate = (key: string) => t(key as never);
	const isTextPage = modality === "text";
	const tocItems = isTextPage
		? [
				{ id: "text", label: translate("leaderboard") },
				{ id: "fastest-models", label: translate("fastestModels") },
				{ id: "benchmarks", label: translate("intelligenceIndex") },
				{ id: "context-length", label: translate("contextLength") },
				{ id: "unique-users", label: translate("uniqueUsers") },
				{ id: "retention", label: translate("weeklyReturnRate") },
				{ id: "market-share", label: translate("marketShare") },
				{ id: "tool-calls", label: translate("toolCalls") },
				{ id: "image-inputs", label: translate("imageInputs") },
				{ id: "top-apps", label: translate("topApps") },
				{ id: "geography", label: translate("countries") },
			]
		: [{ id: modality, label: translate(rankingSectionLabelKeys[modality]) }];

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

                    {/* The leaderboard and fastest models render with the page; each section
                        below loads its data when it scrolls near the viewport. */}
                    {isTextPage ? (
                    <>
					<Suspense fallback={<ListSkeleton />}>
						<TextRankingSignalsServer />
					</Suspense>
<LazyRenderOnVisible id="benchmarks" minHeight={640}>
					<Suspense fallback={<ListSkeleton />}>
						<BenchmarkRankingsSectionServer />
					</Suspense>
</LazyRenderOnVisible>

<LazyRenderOnVisible id="context-length" minHeight={560}>
					<Suspense fallback={<ListSkeleton />}>
						<ContextLengthSection />
					</Suspense>
</LazyRenderOnVisible>

<LazyRenderOnVisible id="unique-users" minHeight={520}>
                    <Suspense fallback={<ChartSkeleton />}>
                        <UniqueUsersSectionServer />
                    </Suspense>
</LazyRenderOnVisible>

<LazyRenderOnVisible id="retention" minHeight={560}>
					<Suspense fallback={<ListSkeleton />}>
						<ModelRetentionSection />
					</Suspense>
</LazyRenderOnVisible>

                    <section id="market-share" className="scroll-mt-32 space-y-12 border-t border-border pt-12">
						<div className="space-y-0.5">
							<h2 className="text-2xl font-semibold leading-8">{translate("marketShare")}</h2>
							<p className="max-w-3xl text-sm text-muted-foreground">
								{translate("marketShareDescription")}
							</p>
						</div>
                        <section className="space-y-4">
                            <div className="space-y-0.5">
								<h3 className="text-xl font-semibold leading-8">{translate("marketShareByOrganisation")}</h3>
                                <p className="text-sm text-muted-foreground">
                                    <span className="inline-flex items-center gap-1.5">
                                        {translate("weeklyOrganizationShareTrends")}
                                        <InlineInfoTooltip
                                            label={translate("whatIsOrganization")}
                                            description={translate("organizationDefinition")}
                                        />
                                    </span>
                                </p>
                            </div>
<LazyRenderOnVisible minHeight={480}>
                            <Suspense fallback={<ChartSkeleton />}>
                                <MarketShareOrganizationServer />
                            </Suspense>
</LazyRenderOnVisible>
                        </section>
                        <section className="space-y-4">
                            <div className="space-y-0.5">
                                <h3 className="text-xl font-semibold leading-8">{translate("marketShareByProvider")}</h3>
                                <p className="text-sm text-muted-foreground">
                                    <span className="inline-flex items-center gap-1.5">
                                        {translate("weeklyProviderShareTrends")}
                                        <InlineInfoTooltip
                                            label={translate("whatIsProvider")}
                                            description={translate("providerDefinition")}
                                        />
                                    </span>
                                </p>
                            </div>
<LazyRenderOnVisible minHeight={480}>
                            <Suspense fallback={<ChartSkeleton />}>
                            <MarketShareProviderServer />
                        </Suspense>
</LazyRenderOnVisible>
                        </section>
                    </section>

<LazyRenderOnVisible id="tool-calls" minHeight={520}>
					<Suspense fallback={<ChartSkeleton />}>
						<ToolCallsSection />
					</Suspense>
</LazyRenderOnVisible>

<LazyRenderOnVisible id="image-inputs" minHeight={520}>
					<Suspense fallback={<ChartSkeleton />}>
						<ImageInputsSection />
					</Suspense>
</LazyRenderOnVisible>

<LazyRenderOnVisible id="top-apps" minHeight={560}>
					<Suspense fallback={<ListSkeleton />}>
						<TopAppsSection />
					</Suspense>
</LazyRenderOnVisible>

<LazyRenderOnVisible id="geography" minHeight={560}>
					<Suspense fallback={<ListSkeleton />}>
						<PublicGeography />
					</Suspense>
</LazyRenderOnVisible>
                    </>
                    ) : null}

					</main>
				</div>
            </div>
        </div>
    );
}

// Leaderboard sections and their data

function formatTokens(value: number, locale: string) {
	if (!Number.isFinite(value)) return "--";
	return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value);
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

function formatCount(value: number, unit: string, locale: string, tokenCount = false) {
	const formatted = tokenCount ? formatRoundedCount(value, locale) : new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value);
	return `${formatted} ${unit}`;
}

function buildPerformanceEntries(
	rows: PerformanceData[],
	metric: "median_throughput" | "median_latency_ms",
	metaMap: Record<string, { name: string | null; organisation_id: string | null; organisation_name: string | null }>,
	providerNames: Record<string, string>,
	locale: string,
	labels: {
		throughput: (value: string) => string;
		latency: (value: string) => string;
		medianLatency: (value: string) => string;
		recentRequests: (count: string) => string;
	},
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
						? labels.throughput(formatTps(value, locale) ?? "")
						: labels.latency(formatLatency(value, locale) ?? ""),
				secondary: labels.recentRequests(new Intl.NumberFormat(locale).format(Number(row.requests ?? 0))),
				tertiary:
					metric === "median_throughput"
						? Number(row.median_latency_ms ?? 0) > 0
							? labels.medianLatency(formatLatency(Number(row.median_latency_ms), locale) ?? "")
							: null
						: Number(row.median_throughput ?? 0) > 0
							? labels.throughput(formatTps(Number(row.median_throughput), locale) ?? "")
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

export function ModalityLeaderboardsServer({ modality }: { modality: RankingModality }) {
	const t = useTranslations("Catalogue.rankings");
	const locale = useLocale();
	const metricTitles = { text_tokens: "modalityMetricTitles.text-volume", image_outputs: "modalityMetricTitles.image-generated", embedding_tokens: "modalityMetricTitles.embedding-volume", rerank_quad_tokens: "modalityMetricTitles.rerank-volume", audio_tokens: "modalityMetricTitles.audio-tokens", video_seconds: "modalityMetricTitles.video-seconds", speech_seconds: "modalityMetricTitles.speech-seconds", transcription_seconds: "audioTranscribed", image_inputs: "modalityMetricTitles.image-inputs", audio_seconds: "modalityMetricTitles.audio-cache", video_tokens: "modalityMetricTitles.video-tokens" } as const;
	const metricTitle = (metric: string) => t(metricTitles[metric as keyof typeof metricTitles]);
	const unitLabel = (unit: string) => unit === "quadtokens" ? unit : t(({ tokens: "usageTokensUnit", images: "usageImagesUnit", seconds: "usageSecondsUnit" } as const)[unit as "tokens" | "images" | "seconds"]);
	const primary = modalityMetrics[modality];
	const secondary = secondaryModalityMetrics[modality];
	const { data: { series, monthly, secondaryMonthly, modelIds, metaMap } } = useSuspenseQuery(modalityLeaderboardsQuery(modality));
	const nameMap = Object.fromEntries(modelIds.map((id) => [id, formatModelDisplayName(metaMap[id]?.name, id)]));
	const logoIdMap = Object.fromEntries(modelIds.map((id) => [id, metaMap[id]?.organisation_id ?? id]));
	const organisationNameMap = Object.fromEntries(modelIds.map((id) => [id, metaMap[id]?.organisation_name ?? null]));
	const entries = (rows: Array<{ model_id: string; current: number }>, unit: string): ModalityLeaderboardEntry[] => {
		const totals = new Map<string, number>();
		for (const row of rows) {
			if (!modelIds.includes(row.model_id)) continue;
			const value = Number(row.current);
			if (Number.isFinite(value) && value > 0) totals.set(row.model_id, (totals.get(row.model_id) ?? 0) + value);
		}
		return [...totals].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([id, value], index) => ({
			key: id, model_id: id, ...metadataFor(id, metaMap), value,
			value_label: formatCount(value, unitLabel(unit), locale, unit === "tokens"), rank: index + 1,
			secondary: t("usagePeriodMonth"),
		}));
	};
	const section: ModalitySectionData = {
		id: modality,
		title: t(rankingSectionLabelKeys[modality] as never), description: t("modalitySectionDescription"),
		chartTitle: metricTitle(primary.metric), chartDescription: `${t("modalityChartDescription")} · UTC`, valueUnit: unitLabel(primary.unit),
		primaryTimeseries: series?.data ?? [], primaryEntries: [], unavailable: series === null,
		metrics: [
			{ id: primary.metric, title: metricTitle(primary.metric), description: t("usagePeriodMonth"), entries: entries(monthly?.data ?? [], primary.unit), unavailable: monthly === null },
			...(secondary ? [{ id: secondary.metric, title: metricTitle(secondary.metric), description: t("usagePeriodMonth"), entries: entries(secondaryMonthly?.data ?? [], secondary.unit), unavailable: secondaryMonthly === null }] : []),
		],
	};
	return <ModalityLeaderboards sections={[section]} nameMap={nameMap} logoIdMap={logoIdMap} organisationNameMap={organisationNameMap} />;
}

function TextRankingSignalsServer() {
	const t = useTranslations("Catalogue.rankings");
	const locale = useLocale();
	const labels = { throughput: (value: string) => t("modalityThroughputValue", { value }), latency: (value: string) => t("modalityLatencyValue", { value }), medianLatency: (value: string) => t("modalityMedianLatencyValue", { value }), recentRequests: (count: string) => t("recentRequests", { count }) };
	const { data: fastest } = useSuspenseQuery(fastestModelsQuery());
	if (!fastest) return <RankingUnavailable id="fastest-models" title={t("fastestModels")} />;
	const { result, metaMap, providerNames } = fastest;
	return <TextRankingSignals
		throughputEntries={buildPerformanceEntries(result.data, "median_throughput", metaMap, providerNames, locale, labels)}
		latencyEntries={buildPerformanceEntries(result.data, "median_latency_ms", metaMap, providerNames, locale, labels)}
	/>;
}

function TextRankingSignals({
	throughputEntries,
	latencyEntries,
}: {
	throughputEntries: ModalityLeaderboardEntry[];
	latencyEntries: ModalityLeaderboardEntry[];
}) {
	const t = useTranslations("Catalogue.rankings");
	return (
		<div className="space-y-16">
			<section
				id="fastest-models"
				className="scroll-mt-32 space-y-6 border-t border-border pt-12"
			>
				<span id="performance" className="sr-only" aria-hidden="true" />
				<div className="space-y-0.5">
					<h2 className="text-2xl font-semibold leading-8">{t("fastestModels")}</h2>
					<p className="max-w-3xl text-sm text-muted-foreground">
						{t("fastestModelsDescription")}
					</p>
				</div>
				<div className="grid gap-12 xl:grid-cols-2 xl:gap-16">
					<RankingBarTable
						title={t("fastestGeneration")}
						description={t("fastestGenerationDescription")}
						entries={throughputEntries}
					/>
					<RankingBarTable
						title={t("lowestLatency")}
						description={t("lowestLatencyDescription")}
						entries={latencyEntries}
						lowerIsBetter
					/>
				</div>
			</section>
		</div>
	);
}

function UniqueUsersSectionServer() {
	const t = useTranslations("Catalogue.rankings");
	const { data: uniqueUsers } = useSuspenseQuery(uniqueUsersQuery());
	if (!uniqueUsers) return <RankingUnavailable id="unique-users" title={t("uniqueUsers")} />;
	const { result, modelIds, metaMap } = uniqueUsers;
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
				<h2 className="text-2xl font-semibold leading-8">{t("uniqueUsers")}</h2>
				<p className="max-w-3xl text-sm text-muted-foreground">
					{t("uniqueUsersDescription")}
				</p>
			</div>
			<UsageStackedBar
				data={result.data}
				leaderboardMetric="users"
				metric="users"
				nameMap={nameMap}
				logoIdMap={logoIdMap}
				organisationNameMap={organisationNameMap}
				modelLicenseMap={modelLicenseMap}
				leaderboardTitle={t("uniqueUsersLeaderboardTitle")}
				leaderboardDescription={t("uniqueUsersLeaderboardDescription")}
				valueUnit={t("usageUsersUnit")}
			/>
		</section>
	);
}

function MarketShareOrganizationServer() {
	const t = useTranslations("Catalogue.rankings");
    const { data: marketShare } = useSuspenseQuery(marketShareOrganizationQuery());
    if (!marketShare) return <RankingUnavailable title={t("marketShareByOrganisation")} />;
    const { timeseriesResult, leaderboardResult, logoMap } = marketShare;

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

function MarketShareProviderServer() {
	const t = useTranslations("Catalogue.rankings");
    const { data: marketShare } = useSuspenseQuery(marketShareProviderQuery());
    if (!marketShare) return <RankingUnavailable title={t("marketShareByProvider")} />;
    const { timeseriesResult, leaderboardResult, providerNameMap } = marketShare;

    const chartData = (timeseriesResult.data ?? [])
        .filter((row) => row.name && row.name.toLowerCase() !== "unknown")
        .map((row) => ({
            ...row,
			name: row.name === "Other" ? t("usageOtherSeries") : providerNameMap[row.name] ?? row.name,
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
