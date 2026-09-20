"use client";

import Link from "next/link";
import { EmptyChartPreview } from "@/components/(rankings)/EmptyChartPreview";
import { RankingMetricLeaderboard } from "@/components/(rankings)/RankingMetricLeaderboard";
import { UsageStackedBar } from "@/components/(rankings)/UsageStackedBar";
import { LazyRenderOnVisible } from "@/components/(rankings)/LazyRenderOnVisible";
import { RankingUnavailable } from "@/components/(rankings)/RankingUnavailable";
import type { TimeseriesData } from "@/lib/fetchers/rankings/getRankingsData";

export type ModalityId =
	| "text"
	| "image"
	| "embeddings"
	| "rerank"
	| "audio"
	| "video"
	| "speech"
	| "transcription";

export type ModalityLeaderboardEntry = {
	key: string;
	model_id: string;
	model_name: string;
	organisation_id?: string | null;
	organisation_name?: string | null;
	provider_id?: string | null;
	provider_name?: string | null;
	value: number;
	value_label: string;
	secondary?: string | null;
	tertiary?: string | null;
	rank?: number | null;
	lowerIsBetter?: boolean;
};

export type ModalityMetric = {
	id: string;
	title: string;
	description: string;
	entries: ModalityLeaderboardEntry[];
	dataNeeded?: string;
	unavailable?: boolean;
};

export type ModalitySectionData = {
	id: ModalityId;
	label: string;
	title: string;
	description: string;
	chartTitle: string;
	chartDescription: string;
	primaryTimeseries: TimeseriesData[];
	primaryEntries: ModalityLeaderboardEntry[];
	metrics: ModalityMetric[];
	valueUnit?: string;
	unavailable?: boolean;
};

type ModalityLeaderboardsProps = {
	sections: ModalitySectionData[];
	nameMap?: Record<string, string>;
	logoIdMap?: Record<string, string | null>;
	organisationNameMap?: Record<string, string | null>;
};

function EmptyChartPlaceholder({ section }: { section: ModalitySectionData }) {
	return (
		<EmptyChartPreview
			title={`No weekly ${section.label.toLowerCase()} usage yet`}
			description="This chart appears once public gateway aggregates expose enough data."
			heightClassName="h-[280px]"
		/>
	);
}

function TopChart({
	section,
	nameMap,
	logoIdMap,
	organisationNameMap,
}: {
	section: ModalitySectionData;
	nameMap: Record<string, string>;
	logoIdMap: Record<string, string | null>;
	organisationNameMap: Record<string, string | null>;
}) {
	const valueUnit = section.valueUnit ?? (
		section.id === "image"
			? "images"
			: section.id === "video"
				? "seconds"
				: section.id === "speech" || section.id === "transcription"
					? "minutes"
					: "tokens");
	if (section.unavailable) return <RankingUnavailable title={section.chartTitle} />;

	if (!section.primaryTimeseries.length) {
		return (
			<div className="space-y-3">
				<div className="space-y-1">
					<h2 className="text-xl font-semibold">{section.chartTitle}</h2>
					<p className="text-sm text-muted-foreground">
						{section.chartDescription}
					</p>
				</div>
				<EmptyChartPlaceholder section={section} />
			</div>
		);
	}

	return (
		<div className="space-y-3">
			<div className="space-y-1">
				<h2 className="text-xl font-semibold">{section.chartTitle}</h2>
				<p className="text-sm text-muted-foreground">
					{section.chartDescription}
				</p>
			</div>
			<UsageStackedBar
				data={section.primaryTimeseries}
				metric="tokens"
				nameMap={nameMap}
				logoIdMap={logoIdMap}
				organisationNameMap={organisationNameMap}
				leaderboardTitle={`${section.label} Leaderboard`}
				leaderboardDescription={`Compare ${section.label.toLowerCase()} models across the selected usage period.`}
				valueUnit={valueUnit}
				showScaleToggle={section.id === "text"}
			/>
		</div>
	);
}
function ModalitySection({
	section,
	nameMap,
	logoIdMap,
	organisationNameMap,
}: {
	section: ModalitySectionData;
	nameMap: Record<string, string>;
	logoIdMap: Record<string, string | null>;
	organisationNameMap: Record<string, string | null>;
}) {
	const latestBucket = section.primaryTimeseries.reduce<Date | null>(
		(latest, row) => {
			const parsed = new Date(row.bucket);
			if (Number.isNaN(parsed.getTime())) return latest;
			return !latest || parsed > latest ? parsed : latest;
		},
		null,
	);
	const updatedThrough = latestBucket?.toLocaleDateString("en-GB", {
		day: "numeric",
		month: "short",
		year: "numeric",
		timeZone: "UTC",
	});
	const availableMetrics = section.metrics;

	return (
		<section
			id={section.id}
			className="scroll-mt-32 space-y-6 border-t border-border pt-12 first:border-t-0 first:pt-0"
		>
			<div className="space-y-2">
				<h1 className="text-3xl font-semibold">
					{section.title}
				</h1>
				<p className="max-w-4xl text-sm leading-6 text-muted-foreground">
					{section.description}
				</p>
				<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
					{updatedThrough ? <span>Week of {updatedThrough}</span> : null}
					{updatedThrough ? <span aria-hidden="true">·</span> : null}
					<Link
						href="/methodology"
						className="underline decoration-transparent underline-offset-2 transition-colors hover:text-foreground hover:decoration-current"
					>
						Methodology
					</Link>
				</div>
			</div>
			{section.primaryTimeseries.length ? (
			<LazyRenderOnVisible minHeight={720}>
				<TopChart
					section={section}
					nameMap={nameMap}
					logoIdMap={logoIdMap}
					organisationNameMap={organisationNameMap}
				/>
			</LazyRenderOnVisible>
			) : (
				<TopChart
					section={section}
					nameMap={nameMap}
					logoIdMap={logoIdMap}
					organisationNameMap={organisationNameMap}
				/>
			)}
			{section.id !== "text" && availableMetrics.length ? (
				<div className="grid gap-10 border-t border-border pt-10 lg:grid-cols-2 lg:gap-16">
					{availableMetrics.map((metric) => (
						metric.unavailable ? <RankingUnavailable key={metric.id} title={metric.title} /> : <RankingMetricLeaderboard
							key={metric.id}
							title={metric.title}
							description={metric.description}
							entries={metric.entries}
						/>
					))}
				</div>
			) : null}
		</section>
	);
}

export function ModalityLeaderboards({
	sections,
	nameMap = {},
	logoIdMap = {},
	organisationNameMap = {},
}: ModalityLeaderboardsProps) {
	const showIntro = sections.length > 1;

	return (
		<div className="space-y-16">
			{showIntro ? (
				<div className="space-y-1">
					<h2 className="text-2xl font-semibold">Modality Leaderboards</h2>
					<p className="max-w-3xl text-sm text-muted-foreground">
						Each section uses modality-specific signals where available, and calls
						out the aggregate needed for the next metric.
					</p>
				</div>
			) : null}
			{sections.map((section) => (
				<ModalitySection
					key={section.id}
					section={section}
					nameMap={nameMap}
					logoIdMap={logoIdMap}
					organisationNameMap={organisationNameMap}
				/>
			))}
		</div>
	);
}
