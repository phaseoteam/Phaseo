"use client";

import React from "react";
import { OTHER_SERIES_KEY } from "./chartSeries";

interface EnhancedChartTooltipProps {
	active?: boolean;
	payload?: ReadonlyArray<any>;
	label?: string | number;
	format: (value: number) => string;
	getColor: (key: string) => string;
	activeKey?: string | null;
	rawBucketRow?: Record<string, string | number> | null;
	getLabel?: (key: string) => string;
	topN?: number;
}

export function EnhancedChartTooltip({
	active,
	payload,
	label,
	format,
	getColor,
	activeKey,
	rawBucketRow,
	getLabel,
	topN = 10,
}: EnhancedChartTooltipProps) {
	if (!active || !payload || payload.length === 0) {
		return null;
	}

	const toFiniteNumber = (value: unknown): number => {
		if (typeof value === "number" && Number.isFinite(value)) return value;
		if (typeof value === "string" && value.trim().length > 0) {
			const parsed = Number(value);
			if (Number.isFinite(parsed)) return parsed;
		}
		return 0;
	};

	type TooltipRow = {
		key: string;
		label: string;
		value: number;
		modelCount?: number;
	};

	const buildRowsFromRaw = (): TooltipRow[] => {
		if (!rawBucketRow) return [];
		const sortable: TooltipRow[] = Object.entries(rawBucketRow)
			.filter(([key]) => key !== "bucket" && key !== OTHER_SERIES_KEY)
			.map(([key, value]) => ({
				key,
				label: getLabel?.(key) ?? key,
				value: toFiniteNumber(value),
			}))
			.filter((item) => item.value > 0)
			.sort((a, b) => b.value - a.value);

		if (sortable.length === 0) return [];

		const visible = sortable.slice(0, topN);
		const rest = sortable.slice(topN);
		if (rest.length > 0) {
			visible.push({
				key: OTHER_SERIES_KEY,
				label: "Other",
				value: rest.reduce((sum, item) => sum + item.value, 0),
				modelCount: rest.length,
			});
		}
		return visible;
	};

	const buildRowsFromPayload = (): TooltipRow[] => {
		const sortable: TooltipRow[] = payload
			.map((item) => {
				const key = String(item?.dataKey ?? item?.name ?? "");
				return {
					key,
					label: typeof item?.name === "string" ? item.name : getLabel?.(key) ?? key,
					value: toFiniteNumber(item?.value),
				};
			})
			.filter((item) => item.key && item.value > 0 && item.key !== "bucket");

		if (sortable.length === 0) return [];

		const explicitOther = sortable.find((item) => item.key === OTHER_SERIES_KEY);
		const nonOther = sortable
			.filter((item) => item.key !== OTHER_SERIES_KEY)
			.sort((a, b) => b.value - a.value);
		const visible = nonOther.slice(0, topN);
		const rest = nonOther.slice(topN);
		const restTotal =
			rest.reduce((sum, item) => sum + item.value, 0) +
			(explicitOther?.value ?? 0);
		const restCount = rest.length + (explicitOther ? 1 : 0);
		if (restTotal > 0) {
			visible.push({
				key: OTHER_SERIES_KEY,
				label: "Other",
				value: restTotal,
				modelCount: restCount,
			});
		}
		return visible;
	};

	const displayItems = buildRowsFromRaw();
	const finalItems = displayItems.length > 0 ? displayItems : buildRowsFromPayload();
	if (finalItems.length === 0) {
		return null;
	}

	const hiddenByOther = finalItems.find((item) => item.key === OTHER_SERIES_KEY)?.modelCount ?? 0;
	const highlightedKey =
		activeKey && finalItems.some((item) => item.key === activeKey)
			? activeKey
			: activeKey && hiddenByOther > 0
				? OTHER_SERIES_KEY
				: finalItems[0]?.key ?? null;
	const total = finalItems.reduce((sum, item) => sum + item.value, 0);

	return (
		<div
			className="bg-background/95 backdrop-blur-sm border rounded-md shadow-lg p-2 text-xs"
			style={{ minWidth: "180px", maxWidth: "220px" }}
		>
			{/* Time bucket label */}
			<div className="font-medium text-muted-foreground mb-1.5 pb-1 border-b text-[10px]">
				{label}
			</div>

			{/* Series items - compact */}
			<div className="space-y-0.5">
				{finalItems.map((item, index) => {
					const isHovered = item.key === highlightedKey;
					const color = getColor(item.key);

					return (
						<div
							key={`${item.key}-${index}`}
							className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded ${
								isHovered ? "bg-accent/60 font-medium" : ""
							}`}
						>
							<div
								className="w-2 h-2 rounded-sm flex-shrink-0"
								style={{ backgroundColor: color }}
							/>
							<span className="flex-1 truncate text-[11px]">
								{item.key === OTHER_SERIES_KEY && item.modelCount && item.modelCount > 0
									? `${item.label} (${item.modelCount})`
									: item.label}
							</span>
							<span className="font-mono text-[11px] ml-auto">
								{format(item.value)}
							</span>
						</div>
					);
				})}
			</div>

			<div className="mt-2 pt-1.5 border-t flex items-center justify-between px-1.5">
				<span className="text-[10px] font-medium text-muted-foreground">Total</span>
				<span className="font-mono text-[11px]">{format(total)}</span>
			</div>
		</div>
	);
}
