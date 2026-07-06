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
import { EmptyChartPreview } from "@/components/(rankings)/EmptyChartPreview";
import { EmptyLeaderboardPreview } from "@/components/(rankings)/EmptyLeaderboardPreview";
import {
	ModalityLeaderboards,
	type ModalityLeaderboardEntry,
	type ModalitySectionData,
} from "@/components/(rankings)/ModalityLeaderboards";
import { RankingsSideNav } from "@/components/(rankings)/RankingsSideNav";
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
    fetchFrontendRankingPerformance,
    fetchFrontendRankingsIndexability,
    fetchFrontendRankingUniqueUserTimeseries,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";
import type {
	MultimodalData,
	ModalityTimeseriesMetric,
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

export const RANKING_MODALITIES: RankingModality[] = [
	"text",
	"image",
	"embeddings",
	"rerank",
	"audio",
	"video",
	"speech",
	"transcription",
];

export function isRankingModality(value: string): value is RankingModality {
	return RANKING_MODALITIES.includes(value as RankingModality);
}

export async function generateRankingsMetadata(): Promise<Metadata> {
	const indexability = await fetchFrontendRankingsIndexability();

	return buildMetadata({
		title: "AI Model Leaderboards: Usage, Pricing, Benchmarks & Reliability",
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

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="mx-auto max-w-[1680px] px-4 py-8 sm:px-6 lg:px-10">
                <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)]">
                    <RankingsSideNav currentModality={modality} className="lg:col-start-1 lg:h-full" />
                    <main className="min-w-0 space-y-16 lg:col-start-2">
                    <Suspense fallback={<ListSkeleton />}>
                        <ModalityLeaderboardsServer modality={modality} />
                    </Suspense>

                    {isTextPage ? (
                    <>
                    <Suspense fallback={<ChartSkeleton />}>
                        <UniqueUsersSectionServer />
                    </Suspense>

                    <section id="market-share" className="scroll-mt-24 space-y-12">
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
                        <OpenRouterMetricSectionServer
                            id="images"
                            title="Images"
                            description="Total images processed across Phaseo gateway traffic."
                            metricKey="image_inputs"
                            leaderboardTitle="Images Leaderboard"
                            leaderboardDescription="Compare models by image inputs processed across the selected usage period."
                            valueUnit="images"
                        />
                    </Suspense>

                    <Suspense fallback={<ChartSkeleton />}>
                        <OpenRouterMetricSectionServer
                            id="image-output"
                            title="Image Output"
                            description="Total images generated across Phaseo gateway traffic."
                            metricKey="image_outputs"
                            leaderboardTitle="Image Output Leaderboard"
                            leaderboardDescription="Compare models by generated images across the selected usage period."
                            valueUnit="images"
                        />
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

function buildVolumeEntries(
	rows: MultimodalData[],
	metric: Exclude<keyof MultimodalData, "model_id">,
	metaMap: Record<string, { name: string | null; organisation_id: string | null; organisation_name: string | null }>,
	label: (value: number) => string,
	secondary: (value: number) => string,
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
				secondary: secondary(value),
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
						? `${Number(row.median_latency_ms ?? 0).toFixed(0)} ms median latency`
						: `${Number(row.median_throughput ?? 0).toFixed(1)} tok/s`,
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
		fetchFrontendRankingMultimodal("week"),
		fetchFrontendRankingPerformance(24),
		fetchFrontendRankingModalityTimeseries("text_tokens", "year"),
		fetchFrontendRankingModalityTimeseries("image_inputs", "year"),
		fetchFrontendRankingModalityTimeseries("image_outputs", "year"),
		fetchFrontendRankingModalityTimeseries("audio_tokens", "year"),
		fetchFrontendRankingModalityTimeseries("video_tokens", "year"),
		fetchFrontendRankingModalityTimeseries("video_seconds", "year"),
		fetchFrontendRankingModalityTimeseries("cached_tokens", "year"),
		fetchFrontendRankingModalityTimeseries("audio_seconds", "year"),
		fetchFrontendRankingModalityTimeseries("embedding_tokens", "year"),
		fetchFrontendRankingModalityTimeseries("rerank_quad_tokens", "year"),
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
		fetchFrontendModelLeaderboardMetaByIds(modelIds),
		fetchFrontendProviderNamesByIds(providerIds),
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
		(value) => formatTokens(value),
		() => "text tokens over the last 7 days",
	);
	const imageInputEntries = buildVolumeEntries(
		multimodalRes.data,
		"image_inputs",
		metaMap,
		(value) => formatCount(value, "images"),
		() => "image inputs observed over the last 7 days",
	);
	const imageGeneratedEntries = buildVolumeEntries(
		multimodalRes.data,
		"image_outputs",
		metaMap,
		(value) => formatCount(value, "images"),
		() => "images generated over the last 7 days",
	);
	const audioEntries = buildVolumeEntries(
		multimodalRes.data,
		"audio_tokens",
		metaMap,
		(value) => formatTokens(value),
		() => "audio tokens over the last 7 days",
	);
	const videoEntries = buildVolumeEntries(
		multimodalRes.data,
		"video_tokens",
		metaMap,
		(value) => formatTokens(value),
		() => "video tokens over the last 7 days",
	);
	const videoSecondsEntries = buildVolumeEntries(
		multimodalRes.data,
		"video_seconds",
		metaMap,
		(value) => `${value.toLocaleString()} sec`,
		() => "generated video duration over the last 7 days",
	);
	const cacheEntries = buildVolumeEntries(
		multimodalRes.data,
		"cached_tokens",
		metaMap,
		(value) => formatTokens(value),
		() => "cached tokens over the last 7 days",
	);
	const audioSecondsEntries = buildVolumeEntries(
		multimodalRes.data,
		"audio_seconds",
		metaMap,
		(value) => `${(value / 60).toFixed(value >= 600 ? 0 : 1)} min`,
		() => "tracked audio duration over the last 7 days",
	);
	const embeddingEntries = buildVolumeEntries(
		multimodalRes.data,
		"embedding_tokens",
		metaMap,
		(value) => formatTokens(value),
		() => "embedding tokens over the last 7 days",
	);
	const rerankEntries = buildVolumeEntries(
		multimodalRes.data,
		"rerank_quad_tokens",
		metaMap,
		(value) => formatTokens(value),
		() => "rerank quadtokens over the last 7 days",
	);
	const throughputEntries = buildPerformanceEntries(
		perfRes.data,
		"median_throughput",
		metaMap,
		providerNames,
	);
	const latencyEntries = buildPerformanceEntries(
		perfRes.data,
		"median_latency_ms",
		metaMap,
		providerNames,
	);

	const sections: ModalitySectionData[] = [
		{
			id: "text",
			label: "Text",
			title: "AI Model Rankings",
			description:
				"Based on real usage data from Phaseo gateway traffic.",
			chartTitle: "Top Models",
			chartDescription: "Weekly usage of models across Phaseo.",
			primaryTimeseries: textTimeseries.data,
			primaryEntries: textEntries,
			metrics: [
				{
					id: "text-volume",
					title: "Total Text Tokens",
					description: "Models ranked by observed text token volume.",
					entries: textEntries,
				},
				{
					id: "text-throughput",
					title: "Fastest Generation",
					description: "Highest recent median output throughput.",
					entries: throughputEntries,
				},
				{
					id: "text-latency",
					title: "Lowest Latency",
					description: "Lowest recent median response latency.",
					entries: latencyEntries,
				},
				{
					id: "text-cache",
					title: "Most Cached Tokens",
					description: "Models with the most cache participation.",
					entries: cacheEntries,
				},
				{
					id: "text-image-inputs",
					title: "Most Image Inputs",
					description: "Vision-style image inputs attached to model traffic.",
					entries: imageInputEntries,
				},
			],
		},
		{
			id: "image",
			label: "Image",
			title: "Image Model Rankings",
			description:
				"Image leaderboards rank generated image volume separately from vision inputs, with room for size and quality cuts as the public rollups mature.",
			chartTitle: "Top Image Models",
			chartDescription: "Weekly generated-image volume by model.",
			primaryTimeseries: imageGeneratedTimeseries.data,
			primaryEntries: imageGeneratedEntries,
			metrics: [
				{
					id: "image-generated",
					title: "Images Generated",
					description: "Models ranked by observed generated-image count.",
					entries: imageGeneratedEntries,
				},
				{
					id: "image-inputs",
					title: "Most Image Inputs",
					description: "Vision inputs attached to multimodal model traffic.",
					entries: imageInputEntries,
				},
				{
					id: "image-timeseries",
					title: "Images Generated Over Time",
					description: "Weekly generated-image counts should be plotted as a time series.",
					entries: [],
					dataNeeded:
						"Add a public generated-image time series by model/provider, plus dimensions for size, quality, and request type.",
				},
			],
		},
		{
			id: "embeddings",
			label: "Embeddings",
			title: "Embedding Model Rankings",
			description:
				"Embedding rankings use native embedding endpoint tokens today; vector-count rollups would make the leaderboard more directly comparable.",
			chartTitle: "Top Embedding Models",
			chartDescription: "Weekly embedding-token volume by model.",
			primaryTimeseries: embeddingTimeseries.data,
			primaryEntries: embeddingEntries,
			metrics: [
				{
					id: "embedding-volume",
					title: "Embedding Volume",
					description: "Rank by native embedding token volume.",
					entries: embeddingEntries,
					dataNeeded:
						"Add generated vector counts by model/provider/week so embedding volume can be shown alongside tokens.",
				},
			],
		},
		{
			id: "rerank",
			label: "Rerank",
			title: "Rerank Model Rankings",
			description:
				"Rerank leaderboards should compare request volume, document volume, latency, and price per rerank operation.",
			chartTitle: "Top Rerank Models",
			chartDescription: "Weekly rerank workload volume by model.",
			primaryTimeseries: rerankTimeseries.data,
			primaryEntries: rerankEntries,
			metrics: [
				{
					id: "rerank-volume",
					title: "Rerank Volume",
					description: "Rank by rerank requests and documents scored.",
					entries: rerankEntries,
					dataNeeded:
						"Add document-count rollups by model/provider/week so rerank volume is not only quadtokens.",
				},
			],
		},
		{
			id: "audio",
			label: "Audio",
			title: "Audio Model Rankings",
			description:
				"Audio leaderboards currently use audio token volume. Speech and transcription need their own unit rollups for seconds and minutes.",
			chartTitle: "Top Audio Models",
			chartDescription: "Weekly audio-token volume by model.",
			primaryTimeseries: audioTimeseries.data,
			primaryEntries: audioEntries,
			metrics: [
				{
					id: "audio-tokens",
					title: "Total Audio Tokens",
					description: "Models ranked by observed audio token volume.",
					entries: audioEntries,
				},
				{
					id: "audio-cache",
					title: "Audio Duration",
					description: "Tracked audio seconds across speech, transcription, and audio input workloads.",
					entries: audioSecondsEntries,
					dataNeeded:
						"Split audio seconds by endpoint so speech and transcription can have separate leaderboards.",
				},
			],
		},
		{
			id: "video",
			label: "Video",
			title: "Video Model Rankings",
			description:
				"Video leaderboards prioritize generated duration, with token volume as a secondary signal for multimodal context.",
			chartTitle: "Top Video Models",
			chartDescription: "Weekly generated-video seconds by model.",
			primaryTimeseries: videoSecondsTimeseries.data,
			primaryEntries: videoSecondsEntries,
			metrics: [
				{
					id: "video-seconds",
					title: "Seconds Generated",
					description: "Models ranked by generated video duration.",
					entries: videoSecondsEntries,
				},
				{
					id: "video-tokens",
					title: "Total Video Tokens",
					description: "Models ranked by observed video token volume.",
					entries: videoEntries,
					dataNeeded:
						"Split video context tokens from generated-video seconds in provider-specific charts.",
				},
			],
		},
		{
			id: "speech",
			label: "Speech",
			title: "Speech Model Rankings",
			description:
				"Speech should be a separate output-audio leaderboard, not mixed into generic audio tokens.",
			chartTitle: "Top Speech Models",
			chartDescription: "Weekly generated speech duration by model once exposed.",
			primaryTimeseries: [],
			primaryEntries: [],
			metrics: [
				{
					id: "speech-seconds",
					title: "Speech Seconds Generated",
					description: "Rank text-to-speech models by generated duration.",
					entries: [],
					dataNeeded:
						"Add generated speech seconds, request count, latency, and price-per-second rollups.",
				},
			],
		},
		{
			id: "transcription",
			label: "Transcription",
			title: "Transcription Model Rankings",
			description:
				"Transcription needs input audio duration and transcript throughput metrics.",
			chartTitle: "Top Transcription Models",
			chartDescription: "Weekly transcribed minutes by model once exposed.",
			primaryTimeseries: [],
			primaryEntries: [],
			metrics: [
				{
					id: "transcription-minutes",
					title: "Minutes Transcribed",
					description: "Rank speech-to-text models by processed audio duration.",
					entries: [],
					dataNeeded:
						"Add transcribed audio minutes, request count, language, latency, and error-rate rollups.",
				},
			],
		},
	];

	const selectedSections = sections.filter((section) => section.id === modality);

	return (
		<ModalityLeaderboards
			sections={selectedSections}
			nameMap={nameMap}
			logoIdMap={logoIdMap}
			organisationNameMap={organisationNameMap}
		/>
	);
}

async function UniqueUsersSectionServer() {
	const result = await fetchFrontendRankingUniqueUserTimeseries("year", "week", 10);
	const modelIds = Array.from(
		new Set(
			result.data
				.map((row) => row.model_id)
				.filter((id) => id && id.toLowerCase() !== "other" && id.toLowerCase() !== "unknown"),
		),
	);
	const metaMap = await fetchFrontendModelLeaderboardMetaByIds(modelIds);
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
		<section id="unique-users" className="scroll-mt-24 space-y-4 border-t border-border pt-12">
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

function ToolCallsSection() {
	return (
		<section id="tool-calls" className="scroll-mt-24 space-y-4 border-t border-border pt-12">
			<div className="space-y-0.5">
				<h2 className="text-2xl font-semibold leading-8">Tool Calls</h2>
				<p className="text-sm text-muted-foreground">
					Tool usage across models on Phaseo.
				</p>
			</div>
			<EmptyChartPreview
				title="No weekly tool-call usage yet"
				description="Tool-call rankings will appear once public gateway rollups expose tool-use counts by model."
				heightClassName="h-[420px]"
			/>
			<EmptyLeaderboardPreview
				title="No tool-call leaderboard yet"
				description="Models appear here once public aggregates include tool calls for the selected usage period."
			/>
		</section>
	);
}

async function OpenRouterMetricSectionServer({
	id,
	title,
	description,
	metricKey,
	leaderboardTitle,
	leaderboardDescription,
	valueUnit,
}: {
	id: string;
	title: string;
	description: string;
	metricKey: ModalityTimeseriesMetric;
	leaderboardTitle: string;
	leaderboardDescription: string;
	valueUnit: string;
}) {
	const result = await fetchFrontendRankingModalityTimeseries(metricKey, "year");
	const modelIds = Array.from(
		new Set(
			result.data
				.map((row) => row.model_id)
				.filter((id) => id && id.toLowerCase() !== "other" && id.toLowerCase() !== "unknown"),
		),
	);
	const metaMap = await fetchFrontendModelLeaderboardMetaByIds(modelIds);
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
		<section id={id} className="scroll-mt-24 space-y-4 border-t border-border pt-12">
			<div className="space-y-0.5">
				<h2 className="text-2xl font-semibold leading-8">{title}</h2>
				<p className="text-sm text-muted-foreground">{description}</p>
			</div>
			<UsageStackedBar
				data={result.data}
				leaderboardData={result.data}
				metric="tokens"
				nameMap={nameMap}
				logoIdMap={logoIdMap}
				organisationNameMap={organisationNameMap}
				modelLicenseMap={modelLicenseMap}
				leaderboardTitle={leaderboardTitle}
				leaderboardDescription={leaderboardDescription}
				valueUnit={valueUnit}
			/>
		</section>
	);
}

async function MarketShareOrganizationServer() {
    const [timeseriesResult, leaderboardResult] = await Promise.all([
        fetchFrontendMarketShareTimeseries("organization", "year", "week", 10),
        fetchFrontendMarketShare("organization", "year"),
    ]);

    const organisationNames = Array.from(
        new Set(
            (leaderboardResult.data ?? [])
                .map((row) => row.name)
                .filter((name) => name && name.toLowerCase() !== "unknown")
        )
    );
    const logoMap = await fetchFrontendOrganisationLogoIdsByNames(organisationNames);

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
        fetchFrontendMarketShareTimeseries("provider", "year", "week", 10),
        fetchFrontendMarketShare("provider", "year"),
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
    const providerNameMap = await fetchFrontendProviderNamesByIds(providerIds);

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
