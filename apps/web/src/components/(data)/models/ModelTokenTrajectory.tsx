"use client";

import { useMemo } from "react";
import { formatRoundedCount } from "@/lib/formatRoundedCount";
import { useLocale, useTranslations } from "next-intl";
import {
	Area,
	AreaChart,
	CartesianGrid,
	ReferenceLine,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { BarChart3 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import type {
	ModelSuccessorMilestone,
	ModelTokenMilestone,
	ModelTokenTrajectory,
	ModelTokenTrajectoryPoint,
} from "@/lib/fetchers/models/getModelTokenTrajectory";
import { DisplayCalendarDate } from "@/components/display/DisplayValue";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";

type RechartsTooltipContentProps = {
	active?: boolean;
	payload?: ReadonlyArray<any>;
	label?: string | number;
};

const EMPTY_POINTS: ModelTokenTrajectoryPoint[] = [];
const EMPTY_TOKEN_MILESTONES: ModelTokenMilestone[] = [];
const EMPTY_SUCCESSOR_MILESTONES: ModelSuccessorMilestone[] = [];

function formatCompact(value: number, locale: string): string {
	return formatRoundedCount(value, locale);
}

function formatDelta(value: number, locale: string): string {
	return new Intl.NumberFormat(locale, {
		notation: "compact",
		maximumFractionDigits: 2,
		signDisplay: "always",
	}).format(value);
}

function formatDays(value: number | null) {
	if (value == null) return "—";
	return `${value}d`;
}

function SuccessorReferenceLabel({ name }: { name: string }) {
	return (
		<div className="rounded border border-border bg-background/90 px-1.5 py-0.5 text-[10px] text-muted-foreground shadow-sm">
			{name}
		</div>
	);
}

interface ModelTokenTrajectoryProps {
	data: ModelTokenTrajectory | null;
}

function MilestoneTable({
	tokenMilestones,
	locale,
}: {
	tokenMilestones: ModelTokenMilestone[];
	locale: string;
}) {
	const t = useTranslations("Catalogue.models.tokenTrajectory");
	return (
		<Table>
			<TableBody>
				{tokenMilestones.map((milestone) => (
					<TableRow key={milestone.threshold}>
						<TableCell className="font-medium">
							{t("milestoneTokens", {
								count: formatCompact(milestone.threshold, locale),
							})}
						</TableCell>
						<TableCell>
							{milestone.daysSinceRelease == null
								? "—"
								: t("daysSinceRelease", {
										count: milestone.daysSinceRelease,
									})}
						</TableCell>
						<TableCell className="text-muted-foreground">
							<DisplayCalendarDate value={milestone.reachedOn} fallback="—" />
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

function SuccessorList({
	successors,
	locale,
}: {
	successors: ModelSuccessorMilestone[];
	locale: string;
}) {
	const t = useTranslations("Catalogue.models.tokenTrajectory");
	if (!successors.length) {
		return <p className="text-sm text-muted-foreground">{t("noSuccessors")}</p>;
	}

	return (
		<Table>
			<TableBody>
				{successors.map((successor) => (
					<TableRow key={successor.modelId}>
						<TableCell className="font-medium">
							{successor.name}
						</TableCell>
						<TableCell>
							{successor.daysSinceRelease == null
								? "—"
								: t("daysSinceRelease", {
										count: successor.daysSinceRelease,
									})}
						</TableCell>
						<TableCell className="text-muted-foreground">
							<DisplayCalendarDate value={successor.releaseDate} fallback="—" />
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

export default function ModelTokenTrajectoryChart({
	data,
}: ModelTokenTrajectoryProps) {
	const format = useDisplayFormatters();
	const t = useTranslations("Catalogue.models.tokenTrajectory");
	const locale = useLocale();
	const points = data?.points ?? EMPTY_POINTS;
	const tokenMilestones = data?.tokenMilestones ?? EMPTY_TOKEN_MILESTONES;
	const successorMilestones = data?.successorMilestones ?? EMPTY_SUCCESSOR_MILESTONES;
	const deprecationDays = data?.deprecationDaysSinceRelease ?? null;

	const chartConfig: ChartConfig = {
		cumulativeTokens: {
			label: t("cumulative"),
			color: "hsl(var(--chart-1))",
		},
	};
	const deprecationLabel = data?.deprecationDate ? t("markedDeprecatedOn", { date: format.calendarDate(data.deprecationDate, "—") }) : null;

	const pointByDay = useMemo(() => {
		const map = new Map<number, ModelTokenTrajectoryPoint>();
		points.forEach((point) => map.set(point.daysSinceRelease, point));
		return map;
	}, [points]);

	const milestoneLookup = useMemo(() => {
		const map = new Map<number, ModelTokenMilestone[]>();
		tokenMilestones.forEach((milestone) => {
			if (milestone.daysSinceRelease == null) return;
			const existing = map.get(milestone.daysSinceRelease) ?? [];
			existing.push(milestone);
			map.set(milestone.daysSinceRelease, existing);
		});
		return map;
	}, [tokenMilestones]);

	const successorLookup = useMemo(() => {
		const map = new Map<number, ModelSuccessorMilestone>();
		successorMilestones.forEach((milestone) => {
			if (milestone.daysSinceRelease == null) return;
			map.set(milestone.daysSinceRelease, milestone);
		});
		return map;
	}, [successorMilestones]);

	const ticks = useMemo(() => {
		const computed = points
			.filter((point) => point.daysSinceRelease % 5 === 0)
			.map((point) => point.daysSinceRelease);
		const lastDay = points[points.length - 1]?.daysSinceRelease ?? 0;
		if (!computed.length) return [0, lastDay];
		if (computed[computed.length - 1] !== lastDay) computed.push(lastDay);
		return computed;
	}, [points]);

	if (!data || !points.length) {
		return (
			<Card className="p-6">
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<BarChart3 />
						</EmptyMedia>
						<EmptyTitle>{t("emptyTitle")}</EmptyTitle>
						<EmptyDescription>{t("emptyDescription")}</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</Card>
		);
	}

	const renderTooltip = ({
		active,
		payload,
	}: RechartsTooltipContentProps) => {
		if (!active || !payload?.length) return null;
		const point = payload[0].payload as ModelTokenTrajectoryPoint;
		const previous = pointByDay.get(point.daysSinceRelease - 1) ?? null;
		const dailyChange = previous
			? point.cumulativeTokens - previous.cumulativeTokens
			: point.cumulativeTokens;
		const milestoneHits = milestoneLookup.get(point.daysSinceRelease) ?? [];
		const successorHit = successorLookup.get(point.daysSinceRelease) ?? null;
		const isDeprecationDay =
			deprecationDays != null && point.daysSinceRelease === deprecationDays;

		return (
			<div className="min-w-[220px] rounded-lg border border-border bg-background/95 p-4 text-sm shadow-xl">
				<div className="mb-2">
					<p className="text-xs uppercase text-muted-foreground">
						{t("day", { count: point.daysSinceRelease })}
					</p>
					<p className="font-semibold">{format.calendarDate(point.date, "—")}</p>
				</div>
				<div className="space-y-1 text-sm">
					<div className="flex items-center justify-between">
						<span>{t("tokensThatDay")}</span>
						<span className="font-mono font-semibold">
							{format.count(point.tokens)}
						</span>
					</div>
					<div className="flex items-center justify-between text-muted-foreground">
						<span>{t("dailyChange")}</span>
						<span className="font-mono">
							{formatDelta(dailyChange, locale)}
						</span>
					</div>
					<div className="flex items-center justify-between text-muted-foreground">
						<span>{t("cumulative")}</span>
						<span className="font-mono">
							{format.count(point.cumulativeTokens)}
						</span>
					</div>
				</div>
				{milestoneHits.length > 0 && (
					<div className="mt-3 rounded border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs">
						<p className="font-semibold text-emerald-600 dark:text-emerald-300">
							{t("milestones")}
						</p>
						<ul className="mt-1 space-y-1 text-muted-foreground">
							{milestoneHits.map((milestone) => (
								<li key={milestone.threshold}>
									{t("hitThreshold", {
										count: formatCompact(milestone.threshold, locale),
										days: milestone.daysSinceRelease ?? 0,
									})}
								</li>
							))}
						</ul>
					</div>
				)}
				{isDeprecationDay && (
					<div className="mt-3 rounded border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
						<p className="font-semibold text-amber-600 dark:text-amber-300">
							{t("deprecated")}
						</p>
						<p className="text-muted-foreground">
							{t("markedDeprecatedOn", {
								date: format.calendarDate(data.deprecationDate, "—"),
							})}
						</p>
					</div>
				)}
				{successorHit && (
					<div className="mt-3 rounded border border-indigo-500/30 bg-indigo-500/5 px-3 py-2 text-xs">
						<p className="font-semibold text-indigo-600 dark:text-indigo-300">
							{t("successorRelease")}
						</p>
						<p className="text-muted-foreground">
							{t("successorLaunchedAfter", {
								name: successorHit.name,
								days: successorHit.daysSinceRelease ?? 0,
							})}
						</p>
					</div>
				)}
			</div>
		);
	};

	return (
		<div className="space-y-6">
			<Card className="p-6">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div>
						<p className="text-xs uppercase tracking-wide text-muted-foreground">
							{t("chartEyebrow")}
						</p>
						<h3 className="text-lg font-semibold text-foreground">
							{t("chartTitle")}
						</h3>
					</div>
					<span className="text-xs text-muted-foreground">
						{t("releaseDate", {
							date: format.calendarDate(data.releaseDate, "—"),
						})}
					</span>
				</div>
				<div className="mt-4 h-[360px]">
					<ChartContainer config={chartConfig} className="h-[360px] w-full">
						<AreaChart data={points}>
							<CartesianGrid
								strokeDasharray="3 3"
								stroke="rgba(148, 163, 184, 0.2)"
								vertical={false}
							/>
							<XAxis
								dataKey="daysSinceRelease"
								ticks={ticks}
								tickFormatter={(value) => `${value}d`}
								axisLine={false}
								tickLine={false}
								tick={{ fontSize: 12, fill: "var(--chart-axis-color)" }}
							/>
							<YAxis
								axisLine={false}
								tickLine={false}
								tick={{ fontSize: 12, fill: "var(--chart-axis-color)" }}
								tickFormatter={(value) => format.countAxisTick(Number(value))}
							/>
			<Tooltip content={renderTooltip} />
							<Area
								type="monotone"
								dataKey="cumulativeTokens"
								stroke="var(--color-cumulativeTokens)"
								fill="var(--color-cumulativeTokens)"
								fillOpacity={0.2}
								strokeWidth={2}
							/>
							{successorMilestones.map((successor) =>
								successor.daysSinceRelease != null ? (
									<ReferenceLine
										key={successor.modelId}
										x={successor.daysSinceRelease}
										stroke="hsl(217, 91%, 60%)"
										strokeDasharray="4 2"
										label={<SuccessorReferenceLabel name={successor.name} />}
									/>
								) : null
							)}
							{deprecationDays != null && (
								<ReferenceLine
									x={deprecationDays}
									stroke="hsl(38, 92%, 50%)"
									strokeDasharray="6 4"
									label={<SuccessorReferenceLabel name={t("deprecated")} />}
								/>
							)}
						</AreaChart>
					</ChartContainer>
				</div>
			</Card>

			<div className="grid gap-6 lg:grid-cols-3">
				<Card className="p-6">
					<div className="mb-4">
						<p className="text-xs uppercase tracking-wide text-muted-foreground">
							{t("deprecationSectionTitle")}
						</p>
						<h3 className="text-lg font-semibold text-foreground">
							{t("lifecycleStatus")}
						</h3>
					</div>
					{data.deprecationDate ? (
						<div className="space-y-2 text-sm">
							<div className="flex items-center justify-between">
								<span>{t("deprecatedOn")}</span>
								<span className="font-semibold">
									{format.calendarDate(data.deprecationDate, "—")}
								</span>
							</div>
							<div className="flex items-center justify-between text-muted-foreground">
								<span>{t("daysAfterLaunch")}</span>
								<span>
									{data.deprecationDaysSinceRelease == null
										? "—"
										: t("daysSinceRelease", {
												count: data.deprecationDaysSinceRelease,
											})}
								</span>
							</div>
						</div>
					) : (
						<p className="text-sm text-muted-foreground">
							{t("notDeprecated")}
						</p>
					)}
				</Card>

				<Card className="p-6">
					<div className="mb-4">
						<p className="text-xs uppercase tracking-wide text-muted-foreground">
							{t("milestones")}
						</p>
						<h3 className="text-lg font-semibold text-foreground">
							{t("daysToThresholds")}
						</h3>
					</div>
					<MilestoneTable
						tokenMilestones={tokenMilestones}
						locale={locale}
					/>
				</Card>

				<Card className="p-6">
					<div className="mb-4">
						<p className="text-xs uppercase tracking-wide text-muted-foreground">
							{t("successorModels")}
						</p>
						<h3 className="text-lg font-semibold text-foreground">
							{t("releaseMilestones")}
						</h3>
					</div>
					<SuccessorList
						successors={successorMilestones}
						locale={locale}
					/>
				</Card>
			</div>
		</div>
	);
}
