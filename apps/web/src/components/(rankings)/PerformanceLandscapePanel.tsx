"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { PerformanceData } from "@/lib/fetchers/rankings/getRankingsData";
import { CalendarDays, Gauge, Zap } from "lucide-react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from "@/components/ui/select";
import {
	PerformanceScatter,
	type PerformanceMode,
} from "@/components/(rankings)/PerformanceScatter";

type RangeKey = "24h" | "7d" | "30d";

const RANGE_OPTIONS: Array<{ key: RangeKey; label: string }> = [
	{ key: "24h", label: "Last 24h" },
	{ key: "7d", label: "Last 7d" },
	{ key: "30d", label: "Last 30d" },
];
const MODE_OPTIONS: Array<{ key: PerformanceMode; label: string }> = [
	{ key: "throughput", label: "Throughput" },
	{ key: "latency", label: "Latency" },
];

type PerformanceLandscapePanelProps = {
	data?: PerformanceData[];
	dataByRange?: Partial<Record<RangeKey, PerformanceData[]>>;
	defaultRange?: RangeKey;
	defaultMode?: "throughput" | "latency";
	showHeader?: boolean;
	title?: string;
	subtitle?: string;
	icon?: ReactNode;
};

export function PerformanceLandscapePanel({
	data,
	dataByRange,
	defaultRange = "24h",
	defaultMode = "throughput",
	showHeader = false,
	title,
	subtitle,
	icon,
}: PerformanceLandscapePanelProps) {
	const resolvedDataByRange = useMemo<Partial<Record<RangeKey, PerformanceData[]>>>(
		() => dataByRange ?? { "24h": data ?? [] },
		[dataByRange, data]
	);

	const availableRanges = useMemo(
		() => RANGE_OPTIONS.filter((option) => resolvedDataByRange[option.key]?.length),
		[resolvedDataByRange]
	);

	const [range, setRange] = useState<RangeKey>(defaultRange);
	const [mode, setMode] = useState<PerformanceMode>(defaultMode);

	useEffect(() => {
		if (resolvedDataByRange[range]?.length) return;
		if (resolvedDataByRange[defaultRange]?.length) {
			if (range !== defaultRange) {
				setRange(defaultRange);
			}
			return;
		}
		const next = availableRanges[0]?.key ?? defaultRange;
		if (range !== next) {
			setRange(next);
		}
	}, [availableRanges, defaultRange, range, resolvedDataByRange]);

	const chartData = resolvedDataByRange[range] ?? [];
	const selectedRangeLabel =
		RANGE_OPTIONS.find((option) => option.key === range)?.label ?? "Range";
	const selectedModeLabel =
		MODE_OPTIONS.find((option) => option.key === mode)?.label ?? "Mode";
	const ModeIcon = mode === "latency" ? Gauge : Zap;
	const controls = (
		<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
			{availableRanges.length > 1 ? (
				<Select
					value={range}
					onValueChange={(value) => setRange(value as RangeKey)}
				>
					<SelectTrigger
						className="h-9 w-full min-w-[10rem] border border-border/70 bg-background shadow-xs hover:bg-muted/45 sm:w-fit dark:border-border/70 dark:bg-background dark:hover:bg-muted/25"
						aria-label="Select performance range"
					>
						<span className="flex min-w-0 items-center gap-2">
							<CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
							<span className="truncate">{selectedRangeLabel}</span>
						</span>
					</SelectTrigger>
					<SelectContent
						align="end"
						alignItemWithTrigger={false}
						className="!w-max min-w-(--anchor-width) max-w-[calc(100vw-2rem)]"
					>
						{RANGE_OPTIONS.map((option) => (
							<SelectItem
								key={option.key}
								value={option.key}
								disabled={!resolvedDataByRange[option.key]?.length}
							>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			) : null}
			<Select
				value={mode}
				onValueChange={(value) => setMode(value as PerformanceMode)}
			>
				<SelectTrigger
					className="h-9 w-full min-w-[10rem] border border-border/70 bg-background shadow-xs hover:bg-muted/45 sm:w-fit dark:border-border/70 dark:bg-background dark:hover:bg-muted/25"
					aria-label="Select performance metric"
				>
					<span className="flex min-w-0 items-center gap-2">
						<ModeIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
						<span className="truncate">{selectedModeLabel}</span>
					</span>
				</SelectTrigger>
				<SelectContent
					align="end"
					alignItemWithTrigger={false}
					className="!w-max min-w-(--anchor-width) max-w-[calc(100vw-2rem)]"
				>
					{MODE_OPTIONS.map((option) => (
						<SelectItem key={option.key} value={option.key}>
							{option.key === "latency" ? (
								<Gauge className="h-3.5 w-3.5 text-muted-foreground" />
							) : (
								<Zap className="h-3.5 w-3.5 text-muted-foreground" />
							)}
							<span>{option.label}</span>
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);

	return (
		<div className="space-y-4">
			{showHeader ? (
				<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div className="space-y-0.5">
						<div className="flex items-center gap-2">
							{icon}
							{title ? <h2 className="text-xl font-semibold leading-8">{title}</h2> : null}
						</div>
						{subtitle ? (
							<p className="text-sm text-muted-foreground">{subtitle}</p>
						) : null}
					</div>
					{controls}
				</div>
			) : null}
			{showHeader ? null : <div className="flex justify-end">{controls}</div>}
			<PerformanceScatter data={chartData} mode={mode} />
		</div>
	);
}
