"use client";

import { useState, type ReactNode } from "react";
import type { PerformanceData } from "@/lib/fetchers/rankings/getRankingsData";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { PerformanceScatter } from "@/components/(rankings)/PerformanceScatter";

type ModeKey = "throughput" | "latency";

const MODE_OPTIONS: Array<{ key: ModeKey; label: string }> = [
	{ key: "throughput", label: "Throughput" },
	{ key: "latency", label: "Latency" },
];

type PerformanceLandscapePanelProps = {
	data: PerformanceData[];
	defaultMode?: ModeKey;
	showHeader?: boolean;
	title?: string;
	icon?: ReactNode;
};

export function PerformanceLandscapePanel({
	data,
	defaultMode = "throughput",
	showHeader = false,
	title = "Performance Landscape",
	icon,
}: PerformanceLandscapePanelProps) {
	const [mode, setMode] = useState<ModeKey>(defaultMode);

	return (
		<div className="space-y-4">
			{showHeader ? (
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="flex items-center gap-2">
						{icon ? (
							<span className="text-muted-foreground">{icon}</span>
						) : null}
						<h2 className="text-2xl font-bold">{title}</h2>
					</div>
					<Select
						value={mode}
						onValueChange={(value) => setMode(value as ModeKey)}
					>
						<SelectTrigger className="h-8 w-[150px]">
							<SelectValue placeholder="Metric" />
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
			) : (
				<div className="flex justify-end">
					<Select
						value={mode}
						onValueChange={(value) => setMode(value as ModeKey)}
					>
						<SelectTrigger className="h-8 w-[150px]">
							<SelectValue placeholder="Metric" />
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
			)}
			<PerformanceScatter data={data} mode={mode} />
		</div>
	);
}
