"use client";

import { useMemo } from "react";
import {
	Area,
	AreaChart,
	CartesianGrid,
	ReferenceLine,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
	type TooltipProps,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import type {
	ModelTokenTrajectory,
	ModelTokenMilestone,
	ModelSuccessorMilestone,
	ModelTokenTrajectoryPoint,
} from "@/lib/fetchers/models/getModelTokenTrajectory";
import {
	Empty,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
	EmptyDescription,
} from "@/components/ui/empty";
import { BarChart3 } from "lucide-react";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";

const cumulativeTokensChartConfig: ChartConfig = {
	cumulativeTokens: {
		label: "Cumulative Tokens",
		color: "hsl(142, 76%, 50%)",
	},
};

type RechartsTooltipContentProps = TooltipProps<number, string> & {
	active?: boolean;
	payload?: Array<any>;
	label?: string | number;
};

function formatCompact(value: number): string {
	if (value >= 1_000_000_000) {
		return `${(value / 1_000_000_000).toFixed(1)}B`;
	}
	if (value >= 1_000_000) {
		return `${(value / 1_000_000).toFixed(1)}M`;
	}
	if (value >= 1_000) {
		return `${(value / 1_000).toFixed(1)}k`;
	}
	return value.toString();
}

function formatDelta(value: number): string {
	const sign = value >= 0 ? "+" : "-";
	const magnitude = Math.abs(value);
	if (magnitude >= 1_000_000_000) {
		return `${sign}${(magnitude / 1_000_000_000).toFixed(2)}B`;
	}
	if (magnitude >= 1_000_000) {
		return `${sign}${(magnitude / 1_000_000).toFixed(2)}M`;
	}
	if (magnitude >= 1_000) {
		return `${sign}${(magnitude / 1_000).toFixed(2)}k`;
	}
	return `${sign}${magnitude}`;
}

function formatDate(value: string | null) {
	if (!value) return "—";
	const date = new Date(value);
	if (!Number.isFinite(date.getTime())) return value;
	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
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
}: {
	tokenMilestones: ModelTokenMilestone[];
}) {
	return (
		<Table>
			<TableBody>
				{tokenMilestones.map((milestone) => (
					<TableRow key={milestone.threshold}>
						<TableCell className="font-medium">
							{formatCompact(milestone.threshold)} tokens
						</TableCell>
						<TableCell>
							{formatDays(milestone.daysSinceRelease)}
						</TableCell>
						<TableCell className="text-muted-foreground">
							{formatDate(milestone.reachedOn)}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

function SuccessorList({
	successors,
}: {
	successors: ModelSuccessorMilestone[];
}) {
	if (!successors.length) {
		return (
			<p className="text-sm text-muted-foreground">
				No successor models have been announced yet.
			</p>
		);
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
							{formatDays(successor.daysSinceRelease)}
						</TableCell>
						<TableCell className="text-muted-foreground">
							{formatDate(successor.releaseDate)}
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
	if (!data || !data.points.length) {
		return (
			<Card className="p-6">
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<BarChart3 />
						</EmptyMedia>
						<EmptyTitle>No token usage yet</EmptyTitle>
						<EmptyDescription>
							We’ll chart cumulative tokens once this model begins
							processing gateway traffic.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</Card>
		);
	}

	const releaseDate = new Date(data.releaseDate);
	const deprecationDays = data.deprecationDaysSinceRelease ?? null;
	const deprecationLabel = data.deprecationDate
		? `Deprecated ${formatDate(data.deprecationDate)}`
		: null;

	const pointByDay = useMemo(() => {
		const map = new Map<number, ModelTokenTrajectoryPoint>();
		data.points.forEach((point) => {
			map.set(point.daysSinceRelease, point);
		});
		return map;
	}, [data.points]);

	const milestoneLookup = useMemo(() => {
		const map = new Map<number, ModelTokenMilestone[]>();
		data.tokenMilestones.forEach((milestone) => {
			if (milestone.daysSinceRelease == null) return;
			const existing = map.get(milestone.daysSinceRelease) ?? [];
			existing.push(milestone);
			map.set(milestone.daysSinceRelease, existing);
		});
		return map;
	}, [data.tokenMilestones]);

	const successorLookup = useMemo(() => {
		const map = new Map<number, ModelSuccessorMilestone>();
		data.successorMilestones.forEach((milestone) => {
			if (milestone.daysSinceRelease == null) return;
			map.set(milestone.daysSinceRelease, milestone);
		});
		return map;
	}, [data.successorMilestones]);

	const ticks = useMemo(() => {
		const computed = data.points
			.filter((point) => point.daysSinceRelease % 5 === 0)
			.map((point) => point.daysSinceRelease);
		const lastDay =
			data.points[data.points.length - 1]?.daysSinceRelease ?? 0;
		if (!computed.length) {
			return [0, lastDay];
		}
		if (computed[computed.length - 1] !== lastDay) {
			computed.push(lastDay);
		}
		return computed;
	}, [data.points]);

	const CustomTooltip = ({
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
		const successorHit =
			successorLookup.get(point.daysSinceRelease) ?? null;
		const isDeprecationDay =
			deprecationDays != null &&
			point.daysSinceRelease === deprecationDays;

		return (
			<div className="min-w-[220px] rounded-lg border border-border bg-background/95 p-4 text-sm shadow-xl">
				<div className="mb-2">
					<p className="text-xs uppercase text-muted-foreground">
						Day {point.daysSinceRelease}
					</p>
					<p className="font-semibold">{formatDate(point.date)}</p>
				</div>
				<div className="space-y-1 text-sm">
					<div className="flex items-center justify-between">
						<span>Tokens that day</span>
						<span className="font-mono font-semibold">
							{formatCompact(point.tokens)}
						</span>
					</div>
					<div className="flex items-center justify-between text-muted-foreground">
						<span>Change vs prev day</span>
						<span className="font-mono">
							{formatDelta(dailyChange)}
						</span>
					</div>
					<div className="flex items-center justify-between text-muted-foreground">
						<span>Cumulative</span>
						<span className="font-mono">
							{formatCompact(point.cumulativeTokens)}
						</span>
					</div>
				</div>
				{milestoneHits.length > 0 && (
					<div className="mt-3 rounded border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs">
						<p className="font-semibold text-emerald-600 dark:text-emerald-300">
							Token milestones
						</p>
						<ul className="mt-1 space-y-1 text-muted-foreground">
							{milestoneHits.map((milestone) => (
								<li key={`${milestone.threshold}`}>
									Hit {formatCompact(milestone.threshold)} (
									{formatDays(milestone.daysSinceRelease)})
								</li>
							))}
						</ul>
					</div>
				)}
				{isDeprecationDay && (
					<div className="mt-3 rounded border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
						<p className="font-semibold text-amber-600 dark:text-amber-300">
							Deprecated
						</p>
						<p className="text-muted-foreground">
							Model marked deprecated on{" "}
							{formatDate(data.deprecationDate)}
						</p>
					</div>
				)}
				{successorHit && (
					<div className="mt-3 rounded border border-indigo-500/30 bg-indigo-500/5 px-3 py-2 text-xs">
						<p className="font-semibold text-indigo-600 dark:text-indigo-300">
							Successor release
						</p>
						<p className="text-muted-foreground">
							{successorHit.name} launched{" "}
							{formatDays(successorHit.daysSinceRelease)} after
							release.
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
							Token usage growth
						</p>
						<h3 className="text-lg font-semibold text-foreground">
							Cumulative tokens since launch
						</h3>
					</div>
					<span className="text-xs text-muted-foreground">
						Release date: {formatDate(data.releaseDate)}
					</span>
				</div>
				<div className="mt-4 h-[360px]">
					<ChartContainer
						config={cumulativeTokensChartConfig}
						className="h-[360px] w-full"
					>
						<AreaChart data={data.points}>
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
								tick={{
									fontSize: 12,
									fill: "var(--chart-axis-color)",
								}}
							/>
							<YAxis
								axisLine={false}
								tickLine={false}
								tick={{
									fontSize: 12,
									fill: "var(--chart-axis-color)",
								}}
								tickFormatter={(value) => formatCompact(value)}
							/>
							<Tooltip content={<CustomTooltip />} />
							<Area
								type="monotone"
								dataKey="cumulativeTokens"
								stroke="var(--color-cumulativeTokens)"
								fill="var(--color-cumulativeTokens)"
								fillOpacity={0.2}
								strokeWidth={2}
							/>
							{data.successorMilestones.map((successor) =>
								successor.daysSinceRelease != null ? (
									<ReferenceLine
										key={successor.modelId}
										x={successor.daysSinceRelease}
										stroke="hsl(var(--color-latency))"
										strokeDasharray="4 2"
										label={
											<SuccessorReferenceLabel
												name={successor.name}
											/>
										}
									/>
								) : null
							)}
							{deprecationDays != null && (
								<ReferenceLine
									x={deprecationDays}
									stroke="hsl(38, 92%, 50%)"
									strokeDasharray="6 4"
									label={
										<SuccessorReferenceLabel name="Deprecated" />
									}
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
							Deprecation
						</p>
						<h3 className="text-lg font-semibold text-foreground">
							Lifecycle status
						</h3>
					</div>
					{data.deprecationDate ? (
						<div className="space-y-2 text-sm">
							<div className="flex items-center justify-between">
								<span>Deprecated on</span>
								<span className="font-semibold">
									{formatDate(data.deprecationDate)}
								</span>
							</div>
							<div className="flex items-center justify-between text-muted-foreground">
								<span>Days after launch</span>
								<span>
									{formatDays(
										data.deprecationDaysSinceRelease
									)}
								</span>
							</div>
						</div>
					) : (
						<p className="text-sm text-muted-foreground">
							This model has not been marked deprecated.
						</p>
					)}
				</Card>

				<Card className="p-6">
					<div className="mb-4">
						<p className="text-xs uppercase tracking-wide text-muted-foreground">
							Token milestones
						</p>
						<h3 className="text-lg font-semibold text-foreground">
							Days to hit key thresholds
						</h3>
					</div>
					<MilestoneTable tokenMilestones={data.tokenMilestones} />
				</Card>

				<Card className="p-6">
					<div className="mb-4">
						<p className="text-xs uppercase tracking-wide text-muted-foreground">
							Successor models
						</p>
						<h3 className="text-lg font-semibold text-foreground">
							Release milestones
						</h3>
					</div>
					<SuccessorList successors={data.successorMilestones} />
				</Card>
			</div>
		</div>
	);
}
