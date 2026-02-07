"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { PerformanceData } from "@/lib/fetchers/rankings/getRankingsData";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
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
	const controls = (
		<div className="flex items-center gap-2">
			{availableRanges.length > 1 ? (
				<Select
					value={range}
					onValueChange={(value) => setRange(value as RangeKey)}
				>
					<SelectTrigger className="h-8 w-[150px]">
						<SelectValue placeholder="Range" />
					</SelectTrigger>
					<SelectContent>
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
				<SelectTrigger className="h-8 w-[150px]">
					<SelectValue placeholder="Mode" />
				</SelectTrigger>
				<SelectContent>
					{MODE_OPTIONS.map((option) => (
						<SelectItem key={option.key} value={option.key}>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);

	return (
		<div className="space-y-4">
			{showHeader ? (
				<div className="flex items-start justify-between gap-3">
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
