"use client";

import React from "react";

interface EnhancedChartTooltipProps {
	active?: boolean;
	payload?: any[];
	label?: string;
	format: (value: number) => string;
	getColor: (key: string) => string;
	activeKey?: string | null;
}

export function EnhancedChartTooltip({
	active,
	payload,
	label,
	format,
	getColor,
	activeKey,
}: EnhancedChartTooltipProps) {
	if (!active || !payload || payload.length === 0) {
		return null;
	}

	// Filter to only non-zero values and sort by value (descending)
	const nonZeroItems = payload
		.filter((item) => item.value > 0)
		.sort((a, b) => (b.value || 0) - (a.value || 0));

	if (nonZeroItems.length === 0) {
		return null;
	}

	const hoveredItem =
		(activeKey
			? nonZeroItems.find((item) => item.dataKey === activeKey)
			: null) || nonZeroItems[0];

	// Show only top 5 items to keep tooltip compact
	const displayItems = nonZeroItems.slice(0, 5);
	const hasMore = nonZeroItems.length > 5;

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
				{displayItems.map((item, index) => {
					const isHovered = item.dataKey === hoveredItem.dataKey;
					const color = getColor(item.dataKey);

					return (
						<div
							key={`${item.dataKey}-${index}`}
							className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded ${
								isHovered ? "bg-accent/60 font-medium" : ""
							}`}
						>
							<div
								className="w-2 h-2 rounded-sm flex-shrink-0"
								style={{ backgroundColor: color }}
							/>
							<span className="flex-1 truncate text-[11px]">
								{item.name || item.dataKey}
							</span>
							<span className="font-mono text-[11px] ml-auto">
								{format(item.value || 0)}
							</span>
						</div>
					);
				})}
				{hasMore && (
					<div className="text-[10px] text-muted-foreground italic px-1.5">
						+{nonZeroItems.length - 5} more
					</div>
				)}
			</div>
		</div>
	);
}
