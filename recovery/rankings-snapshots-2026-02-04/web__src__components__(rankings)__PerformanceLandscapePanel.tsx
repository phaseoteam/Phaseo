"use client";

import { useMemo, useState } from "react";
import type { PerformanceData } from "@/lib/fetchers/rankings/getRankingsData";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { PerformanceScatter } from "@/components/(rankings)/PerformanceScatter";

type RangeKey = "24h" | "7d" | "30d";

const RANGE_OPTIONS: Array<{ key: RangeKey; label: string }> = [
	{ key: "24h", label: "Last 24h" },
	{ key: "7d", label: "Last 7d" },
	{ key: "30d", label: "Last 30d" },
];

type PerformanceLandscapePanelProps = {
	dataByRange: Partial<Record<RangeKey, PerformanceData[]>>;
	defaultRange?: RangeKey;
};

export function PerformanceLandscapePanel({
	dataByRange,
	defaultRange = "24h",
}: PerformanceLandscapePanelProps) {
	const availableRanges = useMemo(
		() => RANGE_OPTIONS.filter((option) => dataByRange[option.key]?.length),
		[dataByRange]
	);

	const [range, setRange] = useState<RangeKey>(() => {
		if (dataByRange[defaultRange]?.length) return defaultRange;
		return availableRanges[0]?.key ?? defaultRange;
	});

	const data = dataByRange[range] ?? [];

	return (
		<div className="space-y-4">
			<div className="flex justify-end">
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
								disabled={!dataByRange[option.key]?.length}
							>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<PerformanceScatter data={data} />
		</div>
	);
}
