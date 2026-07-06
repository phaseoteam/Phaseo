"use client";

import { useMemo } from "react";
import { useQueryState } from "nuqs";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
	ChartContainer,
	ChartTooltip,
	type ChartConfig,
} from "@/components/ui/chart";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { ModelUsageDailyBreakdownRow } from "@/lib/fetchers/models/getModelUsageDailyBreakdown";

type ModelActivityChartProps = {
	rows: ModelUsageDailyBreakdownRow[];
	showHeading?: boolean;
};

type ActivityMode = "tokens" | "requests";

type RequestsActivityShapeProps = {
	x?: number;
	y?: number;
	width?: number;
	height?: number;
	payload?: {
		projectedOverlayTotal?: number;
		requestCount?: number;
	};
};

const TOKEN_SERIES = [
	{ key: "inputTokens", label: "Input", color: "hsl(199 89% 48%)" },
	{ key: "reasoningTokens", label: "Reasoning", color: "hsl(38 92% 50%)" },
	{ key: "outputTokens", label: "Output", color: "hsl(158 64% 42%)" },
] as const;

const REQUEST_SERIES = [
	{ key: "requestCount", label: "Requests", color: "hsl(350 68% 48%)" },
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 30;

function formatCompactNumber(value: number): string {
	if (!Number.isFinite(value)) return "--";
	if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
	if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
	if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
	return Math.round(value).toLocaleString();
}

function formatPaceGain(value: number): string {
	const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
	if (safeValue >= 1_000_000_000) return `+${(safeValue / 1_000_000_000).toFixed(2)}B`;
	if (safeValue >= 1_000_000) return `+${(safeValue / 1_000_000).toFixed(2)}M`;
	if (safeValue >= 1_000) return `+${(safeValue / 1_000).toFixed(2)}K`;
	return `+${safeValue.toFixed(0)}`;
}

function formatDayLabel(value: string): string {
	const date = new Date(`${value}T00:00:00.000Z`);
	if (!Number.isFinite(date.getTime())) return value;
	return date.toLocaleDateString("en-GB", {
		day: "2-digit",
		month: "short",
	});
}

function buildLastUtcDayKeys(days: number, now = new Date()): string[] {
	const keys: string[] = [];
	const anchor = Date.UTC(
		now.getUTCFullYear(),
		now.getUTCMonth(),
		now.getUTCDate(),
	);
	for (let offset = days - 1; offset >= 0; offset -= 1) {
		keys.push(new Date(anchor - offset * DAY_MS).toISOString().slice(0, 10));
	}
	return keys;
}

function getUtcDayStartMs(day: string): number {
	return Date.parse(`${day}T00:00:00.000Z`);
}

function RequestsActivityShape({
	x = 0,
	y = 0,
	width = 0,
	height = 0,
	payload,
}: RequestsActivityShapeProps) {
	const total = Number(payload?.projectedOverlayTotal ?? 0);
	const actual = Number(payload?.requestCount ?? 0);
	const projected = Math.max(0, total - actual);
	if (!Number.isFinite(total) || total <= 0 || actual <= 0) return null;

	const projectedHeight = height * (projected / total);
	const actualHeight = height - projectedHeight;
	if (!Number.isFinite(actualHeight) || actualHeight <= 0) return null;

	return (
		<g>
			{projectedHeight > 0 ? (
				<rect
					x={x}
					y={y}
					width={width}
					height={projectedHeight}
					rx={4}
					ry={4}
					fill="url(#modelActivityProjectedPacePattern)"
				/>
			) : null}
			<rect
				x={x}
				y={y + projectedHeight}
				width={width}
				height={actualHeight}
				fill={REQUEST_SERIES[0].color}
				rx={projectedHeight > 0 ? 0 : 4}
				ry={projectedHeight > 0 ? 0 : 4}
			/>
		</g>
	);
}

export default function ModelActivityChart({
	rows,
	showHeading = false,
}: ModelActivityChartProps) {
	const [modeParam, setModeParam] = useQueryState("activityMetric", {
		defaultValue: "tokens",
	});
	const mode: ActivityMode = modeParam === "requests" ? "requests" : "tokens";

	const { chartData, chartConfig } = useMemo(() => {
		const now = new Date();
		const nowMs = now.getTime();
		const todayUtc = now.toISOString().slice(0, 10);
		const elapsedTodayRatio = Math.min(
			1,
			Math.max(
				1 / DAY_MS,
				(nowMs - getUtcDayStartMs(todayUtc)) / DAY_MS,
			),
		);
		const dayKeys = buildLastUtcDayKeys(HISTORY_DAYS, now);
		const byDay = new Map<
			string,
			{
				day: string;
				inputTokens: number;
				reasoningTokens: number;
				outputTokens: number;
				requestCount: number;
				projectedPace: number;
				projectedTotal: number;
				isCurrentDay: boolean;
			}
		>();

		for (const day of dayKeys) {
			byDay.set(day, {
				day,
				inputTokens: 0,
				reasoningTokens: 0,
				outputTokens: 0,
				requestCount: 0,
				projectedPace: 0,
				projectedTotal: 0,
				isCurrentDay: day === todayUtc,
			});
		}

		for (const row of rows) {
			const day = row.dayBucket;
			if (!day) continue;
			const bucket = byDay.get(day);
			if (!bucket) continue;
			const reasoningTokens = Math.max(0, row.reasoningTokens);
			const visibleOutputTokens = Math.max(0, row.outputTokens - reasoningTokens);

			bucket.inputTokens += row.inputTokens;
			bucket.reasoningTokens += reasoningTokens;
			bucket.outputTokens += visibleOutputTokens;
			bucket.requestCount += row.successRequests;
		}

		for (const day of dayKeys) {
			const bucket = byDay.get(day);
			if (!bucket || !bucket.isCurrentDay) continue;
			const actualValue =
				bucket.inputTokens +
				bucket.reasoningTokens +
				bucket.outputTokens;
			const actualRequests = bucket.requestCount;
			const actualModeValue = mode === "tokens" ? actualValue : actualRequests;
			if (actualModeValue <= 0 || elapsedTodayRatio >= 1) {
				bucket.projectedTotal = actualModeValue;
				continue;
			}
			const projectedTotal = Math.max(
				actualModeValue,
				actualModeValue / elapsedTodayRatio,
			);
			bucket.projectedTotal = projectedTotal;
			bucket.projectedPace = Math.max(0, projectedTotal - actualModeValue);
		}

		const chartData = dayKeys.map((day) => {
			const bucket = byDay.get(day)!;
			const tokenTotal =
				bucket.inputTokens + bucket.reasoningTokens + bucket.outputTokens;
			return {
				...bucket,
				projectedOverlayTotal: bucket.projectedTotal > 0
					? bucket.projectedTotal
					: bucket.requestCount,
				tokenTotal,
			};
		});

		const chartConfig = Object.fromEntries(
			[
				...TOKEN_SERIES,
				...REQUEST_SERIES,
				{
					key: "projectedPace",
					label: "Projected pace",
					color: "hsl(0 0% 70% / 0.5)",
				},
				{
					key: "projectedOverlayTotal",
					label: "Projected total",
					color: "hsl(0 0% 70% / 0.5)",
				},
			].map((series) => [series.key, { label: series.label, color: series.color }]),
		) as ChartConfig;

		return { chartData, chartConfig };
	}, [mode, rows]);

	const activeSeries = mode === "tokens" ? TOKEN_SERIES : REQUEST_SERIES;

	return (
		<div className="space-y-4">
			{showHeading ? (
				<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div className="space-y-1">
						<h2 className="text-xl font-semibold tracking-tight">Activity</h2>
						<p className="text-sm text-muted-foreground">
							Daily gateway activity over the last 30 days, with current UTC-day pace projection.
						</p>
					</div>
					<Select
						value={mode}
						onValueChange={(value) => setModeParam(value as ActivityMode)}
					>
						<SelectTrigger className="h-8 w-[140px] rounded-lg text-xs sm:mt-0.5">
							<SelectValue placeholder="Metric" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="tokens">Tokens</SelectItem>
							<SelectItem value="requests">Requests</SelectItem>
						</SelectContent>
					</Select>
				</div>
			) : null}

			<ChartContainer config={chartConfig} className="h-[300px] w-full">
				<BarChart data={chartData} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
					<defs>
						<pattern
							id="modelActivityProjectedPacePattern"
							patternUnits="userSpaceOnUse"
							width={8}
							height={8}
							patternTransform="rotate(45)"
						>
							<rect width={8} height={8} fill="hsl(0 0% 88% / 0.35)" />
							<line
								x1={0}
								y1={0}
								x2={0}
								y2={8}
								stroke="hsl(0 0% 62% / 0.8)"
								strokeWidth={2}
							/>
						</pattern>
					</defs>
					<CartesianGrid vertical={false} className="stroke-muted" />
					<XAxis
						dataKey="day"
						tickFormatter={(value) => formatDayLabel(String(value))}
						tickLine={false}
						axisLine={false}
						minTickGap={20}
					/>
					<YAxis
						tickFormatter={(value) => formatCompactNumber(Number(value))}
						width={54}
						tickLine={false}
						axisLine={false}
					/>
					<ChartTooltip
						content={({ active, payload, label }) => {
							if (!active || !payload?.length) return null;
							const rowPayload = (payload[0]?.payload ?? {}) as Record<
								string,
								number | string | boolean
							>;
							const filteredPayload = payload.filter(
								(item) =>
									String(item?.dataKey ?? "") !== "projectedPace" &&
									String(item?.dataKey ?? "") !== "projectedOverlayTotal" &&
									Number(item?.value ?? 0) > 0,
							);
							const actualValue =
								mode === "tokens"
									? Number(rowPayload.tokenTotal ?? 0)
									: Number(rowPayload.requestCount ?? 0);
							const projectedAdditional = Number(rowPayload.projectedPace ?? 0);
							const projectedTotal = Number(rowPayload.projectedTotal ?? actualValue);
							const isCurrentDay = Boolean(rowPayload.isCurrentDay);

							if (!filteredPayload.length && actualValue <= 0 && projectedAdditional <= 0) {
								return null;
							}

							return (
								<div className="grid min-w-[12.5rem] items-start gap-1.5 rounded-lg border border-zinc-200/50 bg-white px-2.5 py-1.5 text-xs shadow-xl dark:border-zinc-800/50 dark:bg-zinc-950">
									<p className="font-medium text-foreground">
										{formatDayLabel(String(label ?? ""))}
									</p>
									<div className="space-y-1">
										{mode === "requests" && actualValue > 0 ? (
											<div className="flex w-full items-center justify-between gap-3 rounded-md px-1.5 py-0.5">
												<div className="flex items-center gap-2">
													<span
														className="size-2 rounded-[2px]"
														style={{ backgroundColor: REQUEST_SERIES[0].color }}
													/>
													<span>Requests</span>
												</div>
												<span className="font-medium tabular-nums">
													{formatCompactNumber(actualValue)}
												</span>
											</div>
										) : null}
										{filteredPayload.map((item) => (
											<div
												key={String(item.dataKey ?? item.name ?? "")}
												className="flex w-full items-center justify-between gap-3 rounded-md px-1.5 py-0.5"
											>
												<div className="flex items-center gap-2">
													<span
														className="size-2 rounded-[2px]"
														style={{
															backgroundColor: String(item.color ?? "currentColor"),
														}}
													/>
													<span>{String(item.name ?? "")}</span>
												</div>
												<span className="font-medium tabular-nums">
													{formatCompactNumber(Number(item.value ?? 0))}
												</span>
											</div>
										))}
									</div>
									<div className="space-y-0.5 border-t border-border/60 pt-1.5 text-xs">
										<div className="flex items-center justify-between gap-4">
											<span className="text-muted-foreground">
												{isCurrentDay ? "So far" : "Total"}
											</span>
											<span className="whitespace-nowrap tabular-nums">
												{formatCompactNumber(actualValue)}
											</span>
										</div>
										{isCurrentDay ? (
											<>
												<div className="flex items-center justify-between gap-4">
													<span className="text-muted-foreground">Daily pace</span>
													<span className="whitespace-nowrap tabular-nums">
														{formatCompactNumber(projectedTotal)} ({formatPaceGain(projectedAdditional)})
													</span>
												</div>
											</>
										) : null}
									</div>
								</div>
							);
						}}
					/>
					{mode === "tokens" ? (
						<>
							{activeSeries.map((series, index) => (
								<Bar
									key={series.key}
									dataKey={series.key}
									name={series.label}
									stackId="usage"
									fill={`var(--color-${series.key})`}
									radius={
										index === activeSeries.length - 1
											? [4, 4, 0, 0]
											: [0, 0, 0, 0]
									}
									isAnimationActive={false}
								/>
							))}
							<Bar
								dataKey="projectedPace"
								name="Projected pace"
								stackId="usage"
								fill="url(#modelActivityProjectedPacePattern)"
								radius={[4, 4, 0, 0]}
								isAnimationActive={false}
							/>
						</>
					) : (
						<Bar
							dataKey="projectedOverlayTotal"
							name="Requests"
							fill="transparent"
							isAnimationActive={false}
							shape={<RequestsActivityShape />}
						/>
					)}
				</BarChart>
			</ChartContainer>
		</div>
	);
}
