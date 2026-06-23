"use client";

import { useEffect, useMemo, useState } from "react";
import type { PerformanceData } from "@/lib/fetchers/rankings/getRankingsData";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, ChevronDown } from "lucide-react";
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

function rangeLabel(value: RangeKey) {
	return RANGE_OPTIONS.find((option) => option.key === value)?.label ?? value;
}

function modeLabel(value: PerformanceMode) {
	return MODE_OPTIONS.find((option) => option.key === value)?.label ?? value;
}

type PerformanceLandscapePanelProps = {
	data?: PerformanceData[];
	dataByRange?: Partial<Record<RangeKey, PerformanceData[]>>;
	defaultRange?: RangeKey;
	defaultMode?: "throughput" | "latency";
	showHeader?: boolean;
	title?: string;
	subtitle?: string;
};

export function PerformanceLandscapePanel({
	data,
	dataByRange,
	defaultRange = "24h",
	defaultMode = "throughput",
	showHeader = false,
	title,
	subtitle,
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
		<div className="flex shrink-0 items-center gap-2">
			{availableRanges.length > 1 ? (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-9 w-32 justify-between rounded-lg px-4 font-normal text-muted-foreground"
						>
							{rangeLabel(range)}
							<ChevronDown className="ml-2 h-4 w-4 opacity-60" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="min-w-32">
						{RANGE_OPTIONS.map((option) => (
							<DropdownMenuItem
								key={option.key}
								disabled={!resolvedDataByRange[option.key]?.length}
								onSelect={() => setRange(option.key)}
								className="justify-between gap-6"
							>
								<span>{option.label}</span>
								<span className="flex h-4 w-4 items-center justify-center">
									{range === option.key ? (
										<Check className="h-4 w-4 text-primary" />
									) : null}
								</span>
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			) : null}
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="h-9 w-36 justify-between rounded-lg px-4 font-normal text-muted-foreground"
					>
						{modeLabel(mode)}
						<ChevronDown className="ml-2 h-4 w-4 opacity-60" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="min-w-36">
					{MODE_OPTIONS.map((option) => (
						<DropdownMenuItem
							key={option.key}
							onSelect={() => setMode(option.key)}
							className="justify-between gap-6"
						>
							<span>{option.label}</span>
							<span className="flex h-4 w-4 items-center justify-center">
								{mode === option.key ? (
									<Check className="h-4 w-4 text-primary" />
								) : null}
							</span>
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);

	return (
		<div className="space-y-4">
			{showHeader ? (
				<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
					<div className="min-w-0 max-w-xl space-y-0.5">
						{title ? <h2 className="text-xl font-semibold leading-8">{title}</h2> : null}
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
