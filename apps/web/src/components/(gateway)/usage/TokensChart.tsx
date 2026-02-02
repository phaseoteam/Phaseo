"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { BarChart, Bar, CartesianGrid, XAxis, YAxis } from "recharts";

interface TokensChartProps {
	data: Array<{
		bucket: string;
		[modelId: string]: number | string;
	}>;
	colorMap: Map<string, string>;
	onBarClick?: (bucket: string) => void;
}

function hash32(str: string) {
	let h = 0x811c9dc5 >>> 0;
	for (let i = 0; i < str.length; i++) {
		h ^= str.charCodeAt(i);
		h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
	}
	return h >>> 0;
}

function getModelColor(modelId: string, colorMap: Map<string, string>) {
	const orgColor = colorMap.get(modelId);
	if (orgColor) {
		return { fill: orgColor, stroke: orgColor };
	}

	// Fallback: hash-based pastel color
	const hue = hash32(modelId) % 360;
	return {
		fill: `hsl(${hue} 45% 78% / 0.88)`,
		stroke: `hsl(${hue} 35% 58% / 0.95)`,
	};
}

export default function TokensChart({
	data,
	colorMap,
	onBarClick,
}: TokensChartProps) {
	// Extract model IDs from data (excluding 'bucket' key)
	const modelIds = React.useMemo(() => {
		const ids = new Set<string>();
		data.forEach((row) => {
			Object.keys(row).forEach((key) => {
				if (key !== "bucket") {
					ids.add(key);
				}
			});
		});
		return Array.from(ids).sort((a, b) => {
			// Sort by total tokens (descending)
			const totalA = data.reduce((sum, row) => sum + (Number(row[a]) || 0), 0);
			const totalB = data.reduce((sum, row) => sum + (Number(row[b]) || 0), 0);
			return totalB - totalA;
		});
	}, [data]);

	// Build chart config
	const chartConfig = React.useMemo(() => {
		const config: Record<string, { label: string; color: string }> = {};
		modelIds.forEach((modelId) => {
			const colors = getModelColor(modelId, colorMap);
			config[modelId] = {
				label: modelId,
				color: colors.fill,
			};
		});
		return config;
	}, [modelIds, colorMap]);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-sm font-medium">Tokens</CardTitle>
			</CardHeader>
			<CardContent>
				<ChartContainer config={chartConfig} className="h-[300px] w-full">
					<BarChart data={data} margin={{ left: 0, right: 12 }}>
						<CartesianGrid vertical={false} />
						<XAxis dataKey="bucket" tickLine={false} axisLine={false} />
						<YAxis tickLine={false} axisLine={false} />
						<ChartTooltip
							content={
								<ChartTooltipContent
									labelFormatter={(label) => String(label)}
									formatter={(value, name) => [
										Number(value).toLocaleString(),
										String(name),
									]}
								/>
							}
						/>
						{modelIds.map((modelId) => {
							const colors = getModelColor(modelId, colorMap);
							return (
								<Bar
									key={modelId}
									dataKey={modelId}
									stackId="a"
									fill={colors.fill}
									stroke={colors.stroke}
									strokeWidth={0.8}
									onClick={(data) => {
										if (onBarClick && data.bucket) {
											onBarClick(data.bucket as string);
										}
									}}
									style={{ cursor: onBarClick ? "pointer" : "default" }}
								/>
							);
						})}
					</BarChart>
				</ChartContainer>
			</CardContent>
		</Card>
	);
}
