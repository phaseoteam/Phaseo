// app/(dashboard)/rankings/RankingsPageContent.tsx
// Purpose: Public rankings page showing AI model usage statistics
// Why: Provides transparency and insights into model usage across the gateway
// How: Server component that fetches data and renders visualizations

import { Suspense } from "react";
import { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { buildLocalizedPageMetadata } from "@/lib/auth/localized-metadata";
import type { PublicLocale } from "@/i18n/routing";
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
import ModelPageToc from "@/components/(data)/model/ModelPageToc";
import { ChartSkeleton, ListSkeleton } from "@/components/(rankings)/Skeletons";
import { InlineInfoTooltip } from "@/components/(rankings)/InlineInfoTooltip";
import {
    fetchFrontendMarketShare,
    fetchFrontendMarketShareTimeseries,
    fetchFrontendModelLeaderboardMetaByIds,
    fetchFrontendOrganisationLogoIdsByNames,
    fetchFrontendProviderNamesByIds,
    fetchFrontendRankingModalityTimeseries,
    fetchFrontendRankingMultimodal,
    fetchFrontendRankingsIndexability,
    fetchFrontendRankingUniqueUserTimeseries,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";
import {
	fetchFrontendRankingFastestModels,
	fetchFrontendRankingImageInputs,
	fetchFrontendRankingTextLeaderboard,
} from "@/lib/fetchers/frontend/fetchRankingSections";
import type {
	MultimodalData,
	PerformanceData,
} from "@/lib/fetchers/rankings/getRankingsData";
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

export async function generateRankingsMetadata(): Promise<Metadata> {
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

export default async function RankingsPageContent({
	modality = "text",
}: {
	modality?: RankingModality;
}) {
	const t = await getTranslations("Catalogue.rankings");
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

                    {isTextPage ? (
                    <>
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
                            <Suspense fallback={<ChartSkeleton />}>
                                <MarketShareOrganizationServer />
                            </Suspense>
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

function formatCount(value: number, unit: string, locale: string) {
	const formatted = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value);
	return `${formatted} ${unit}`;
}

function buildVolumeEntries(
	rows: MultimodalData[],
	metric: Exclude<keyof MultimodalData, "model_id">,
	metaMap: Record<string, { name: string | null; organisation_id: string | null; organisation_name: string | null }>,
	label: (value: number) => string,
): ModalityLeaderboardEntry[] {
	return rows
		.map((row): ModalityLeaderboardEntry | null => {
			const value = Number(row[metric] ?? 0);
			if (!row.model_id || !Number.isFinite(value) || value <= 0) return null;
			const meta = metadataFor(row.model_id, metaMap);
			return {
				key: `${String(metric)}:${row.model_id}`,
				model_id: row.model_id,
				...meta,
				value,
				value_label: label(value),
			};
		})
		.filter((entry): entry is ModalityLeaderboardEntry => entry !== null)
		.sort((left, right) => right.value - left.value)
		.slice(0, 20)
		.map((entry, index) => ({ ...entry, rank: index + 1 }));
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
						? labels.throughput(new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value))
						: labels.latency(new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)),
				tertiary:
					metric === "median_throughput"
						? Number(row.median_latency_ms ?? 0) > 0
							? labels.medianLatency(new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Number(row.median_latency_ms)))
							: null
						: Number(row.median_throughput ?? 0) > 0
							? labels.throughput(new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(row.median_throughput)))
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

async function ModalityLeaderboardsServer({
	modality,
}: {
	modality: RankingModality;
}) {
	const [t, locale] = await Promise.all([
		getTranslations("Catalogue.rankings"),
		getLocale(),
	]);
	const [
		multimodalRes,
		perfRes,
		textTimeseries,
		imageInputTimeseries,
		imageGeneratedTimeseries,
		audioTimeseries,
		videoTimeseries,
		videoSecondsTimeseries,
		cacheTimeseries,
		audioSecondsTimeseries,
		embeddingTimeseries,
		rerankTimeseries,
	] = await Promise.all([
		fetchFrontendRankingMultimodal("month").catch(() => ({ data: [] })),
		fetchFrontendRankingFastestModels(30, 20).catch(() => ({ data: [] })),
		fetchFrontendRankingTextLeaderboard("year", 20).catch(() => ({ data: [] })),
		fetchFrontendRankingImageInputs("year", 20).catch(() => ({ data: [] })),
		fetchFrontendRankingModalityTimeseries("image_outputs", "year").catch(() => ({ data: [] })),
		fetchFrontendRankingModalityTimeseries("audio_tokens", "year").catch(() => ({ data: [] })),
		fetchFrontendRankingModalityTimeseries("video_tokens", "year").catch(() => ({ data: [] })),
		fetchFrontendRankingModalityTimeseries("video_seconds", "year").catch(() => ({ data: [] })),
		fetchFrontendRankingModalityTimeseries("cached_tokens", "year").catch(() => ({ data: [] })),
		fetchFrontendRankingModalityTimeseries("audio_seconds", "year").catch(() => ({ data: [] })),
		fetchFrontendRankingModalityTimeseries("embedding_tokens", "year").catch(() => ({ data: [] })),
		fetchFrontendRankingModalityTimeseries("rerank_quad_tokens", "year").catch(() => ({ data: [] })),
	]);

	const modelIds = Array.from(
		new Set([
			...multimodalRes.data.map((row) => row.model_id).filter(Boolean),
			...perfRes.data.map((row) => row.model_id).filter(Boolean),
			...textTimeseries.data.map((row) => row.model_id).filter(Boolean),
			...imageInputTimeseries.data.map((row) => row.model_id).filter(Boolean),
			...imageGeneratedTimeseries.data.map((row) => row.model_id).filter(Boolean),
			...audioTimeseries.data.map((row) => row.model_id).filter(Boolean),
			...videoTimeseries.data.map((row) => row.model_id).filter(Boolean),
			...videoSecondsTimeseries.data.map((row) => row.model_id).filter(Boolean),
			...cacheTimeseries.data.map((row) => row.model_id).filter(Boolean),
			...audioSecondsTimeseries.data.map((row) => row.model_id).filter(Boolean),
			...embeddingTimeseries.data.map((row) => row.model_id).filter(Boolean),
			...rerankTimeseries.data.map((row) => row.model_id).filter(Boolean),
		]),
	);
	const providerIds = Array.from(
		new Set(perfRes.data.map((row) => row.provider).filter(Boolean)),
	);
	const [metaMap, providerNames] = await Promise.all([
		fetchFrontendModelLeaderboardMetaByIds(modelIds).catch(
			(): Awaited<ReturnType<typeof fetchFrontendModelLeaderboardMetaByIds>> => ({}),
		),
		fetchFrontendProviderNamesByIds(providerIds).catch(
			(): Record<string, string> => ({}),
		),
	]);
	const nameMap = Object.fromEntries(
		Object.entries(metaMap).map(([modelId, meta]) => [
			modelId,
			formatModelDisplayName(meta.name, modelId),
		]),
	);
	const logoIdMap = Object.fromEntries(
		Object.entries(metaMap).map(([modelId, meta]) => [
			modelId,
			meta.organisation_id ?? modelId,
		]),
	);
	const organisationNameMap = Object.fromEntries(
		Object.entries(metaMap).flatMap(([modelId, meta]) => [
			[modelId, meta.organisation_name ?? meta.organisation_id ?? null],
			...(meta.organisation_id
				? [[meta.organisation_id, meta.organisation_name ?? meta.organisation_id]]
				: []),
		]),
	);

	const textEntries = buildVolumeEntries(
		multimodalRes.data,
		"text_tokens",
		metaMap,
		(value) => formatTokens(value, locale),
	);
	const imageInputEntries = buildVolumeEntries(
		multimodalRes.data,
		"image_inputs",
		metaMap,
		(value) => formatCount(value, t("usageImagesUnit"), locale),
	);
	const imageGeneratedEntries = buildVolumeEntries(
		multimodalRes.data,
		"image_outputs",
		metaMap,
		(value) => formatCount(value, t("usageImagesUnit"), locale),
	);
	const audioEntries = buildVolumeEntries(
		multimodalRes.data,
		"audio_tokens",
		metaMap,
		(value) => formatTokens(value, locale),
	);
	const videoEntries = buildVolumeEntries(
		multimodalRes.data,
		"video_tokens",
		metaMap,
		(value) => formatTokens(value, locale),
	);
	const videoSecondsEntries = buildVolumeEntries(
		multimodalRes.data,
		"video_seconds",
		metaMap,
		(value) => formatCount(value, t("usageSecondsUnit"), locale),
	);
	const cacheEntries = buildVolumeEntries(
		multimodalRes.data,
		"cached_tokens",
		metaMap,
		(value) => formatTokens(value, locale),
	);
	const audioSecondsEntries = buildVolumeEntries(
		multimodalRes.data,
		"audio_seconds",
		metaMap,
		(value) => `${new Intl.NumberFormat(locale, { maximumFractionDigits: value >= 600 ? 0 : 1 }).format(value / 60)} ${t("usageMinutesUnit")}`,
	);
	const embeddingEntries = buildVolumeEntries(
		multimodalRes.data,
		"embedding_tokens",
		metaMap,
		(value) => formatTokens(value, locale),
	);
	const rerankEntries = buildVolumeEntries(
		multimodalRes.data,
		"rerank_quad_tokens",
		metaMap,
		(value) => formatTokens(value, locale),
	);
	const throughputEntries = buildPerformanceEntries(
		perfRes.data,
		"median_throughput",
		metaMap,
		providerNames,
		locale,
		{
			throughput: (value) => t("modalityThroughputValue", { value }),
			latency: (value) => t("modalityLatencyValue", { value }),
			medianLatency: (value) => t("modalityMedianLatencyValue", { value }),
		},
	);
	const latencyEntries = buildPerformanceEntries(
		perfRes.data,
		"median_latency_ms",
		metaMap,
		providerNames,
		locale,
		{
			throughput: (value) => t("modalityThroughputValue", { value }),
			latency: (value) => t("modalityLatencyValue", { value }),
			medianLatency: (value) => t("modalityMedianLatencyValue", { value }),
		},
	);

	const localizedModalityTitles = t.raw("modalityTitles" as never) as Record<RankingModality, string>;
	const localizedMetricTitles = t.raw("modalityMetricTitles" as never) as Record<string, string>;
	const sectionCopy = (id: RankingModality) => ({
		title: localizedModalityTitles[id],
		description: t("modalitySectionDescription"),
		chartTitle: t("modalityTopModels"),
		chartDescription: t("modalityChartDescription"),
	});
	const metricCopy = (id: string, entries: ModalityLeaderboardEntry[]) => ({
		id,
		title: localizedMetricTitles[id],
		description: t("modalityMetricDescription"),
		entries,
	});
	const sections: ModalitySectionData[] = [
		{
			id: "text",
			...sectionCopy("text"),
			primaryTimeseries: textTimeseries.data,
			primaryEntries: textEntries,
			metrics: [
				metricCopy("text-volume", textEntries),
				metricCopy("text-throughput", throughputEntries),
				metricCopy("text-latency", latencyEntries),
				metricCopy("text-cache", cacheEntries),
				metricCopy("text-image-inputs", imageInputEntries),
			],
		},
		{
			id: "image",
			...sectionCopy("image"),
			primaryTimeseries: imageInputTimeseries.data,
			primaryEntries: imageInputEntries,
			metrics: [
				metricCopy("image-generated", imageGeneratedEntries),
				metricCopy("image-inputs", imageInputEntries),
				metricCopy("image-timeseries", []),
			],
		},
		{
			id: "embeddings",
			...sectionCopy("embeddings"),
			primaryTimeseries: embeddingTimeseries.data,
			primaryEntries: embeddingEntries,
			metrics: [metricCopy("embedding-volume", embeddingEntries)],
		},
		{
			id: "rerank",
			...sectionCopy("rerank"),
			primaryTimeseries: rerankTimeseries.data,
			primaryEntries: rerankEntries,
			metrics: [metricCopy("rerank-volume", rerankEntries)],
		},
		{
			id: "audio",
			...sectionCopy("audio"),
			primaryTimeseries: audioTimeseries.data,
			primaryEntries: audioEntries,
			metrics: [
				metricCopy("audio-tokens", audioEntries),
				metricCopy("audio-cache", audioSecondsEntries),
			],
		},
		{
			id: "video",
			...sectionCopy("video"),
			primaryTimeseries: videoSecondsTimeseries.data,
			primaryEntries: videoSecondsEntries,
			metrics: [
				metricCopy("video-seconds", videoSecondsEntries),
				metricCopy("video-tokens", videoEntries),
			],
		},
		{
			id: "speech",
			...sectionCopy("speech"),
			primaryTimeseries: [],
			primaryEntries: [],
			metrics: [metricCopy("speech-seconds", [])],
		},
		{
			id: "transcription",
			...sectionCopy("transcription"),
			primaryTimeseries: [],
			primaryEntries: [],
			metrics: [metricCopy("transcription-minutes", [])],
		},
	];

	const selectedSections = sections.filter((section) => section.id === modality);

	return (
		<>
			<ModalityLeaderboards
				sections={selectedSections}
				nameMap={nameMap}
				logoIdMap={logoIdMap}
				organisationNameMap={organisationNameMap}
			/>
			{modality === "text" ? (
				<TextRankingSignals
					throughputEntries={throughputEntries}
					latencyEntries={latencyEntries}
				/>
			) : null}
		</>
	);
}

async function TextRankingSignals({
	throughputEntries,
	latencyEntries,
}: {
	throughputEntries: ModalityLeaderboardEntry[];
	latencyEntries: ModalityLeaderboardEntry[];
}) {
	const t = await getTranslations("Catalogue.rankings");
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

async function UniqueUsersSectionServer() {
	const t = await getTranslations("Catalogue.rankings");
	const result = await fetchFrontendRankingUniqueUserTimeseries("year", "week", 10).catch(() => ({ data: [] }));
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
				<h2 className="text-2xl font-semibold leading-8">{t("uniqueUsers")}</h2>
				<p className="max-w-3xl text-sm text-muted-foreground">
					{t("uniqueUsersDescription")}
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
				leaderboardTitle={t("uniqueUsersLeaderboardTitle")}
				leaderboardDescription={t("uniqueUsersLeaderboardDescription")}
				valueUnit={t("usageUsersUnit")}
			/>
		</section>
	);
}

async function MarketShareOrganizationServer() {
    const [timeseriesResult, leaderboardResult] = await Promise.all([
        fetchFrontendMarketShareTimeseries("organization", "year", "week", 10).catch(() => ({ data: [] })),
        fetchFrontendMarketShare("organization", "year").catch(() => ({ data: [] })),
    ]);

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
	const t = await getTranslations("Catalogue.rankings");
    const [timeseriesResult, leaderboardResult] = await Promise.all([
        fetchFrontendMarketShareTimeseries("provider", "year", "week", 10).catch(() => ({ data: [] })),
        fetchFrontendMarketShare("provider", "year").catch(() => ({ data: [] })),
    ]);

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
