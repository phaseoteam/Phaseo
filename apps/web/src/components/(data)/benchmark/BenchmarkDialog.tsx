"use client";

import React from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	ResponsiveContainer,
	BarChart,
	Bar,
	XAxis,
	YAxis,
	Tooltip,
	LabelList,
	Cell,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";

// Custom tooltip component
type TooltipProps = {
	active?: boolean;
	payload?: any[];
	label?: string;
};

function BenchmarkTooltip({ active, payload }: TooltipProps) {
	const format = useDisplayFormatters();
	if (!active || !payload || !payload.length) return null;
	const model = payload[0].payload;
	return (
		<Card className="bg-white dark:bg-zinc-900 rounded-lg shadow-lg p-3 border border-zinc-200 dark:border-zinc-800 min-w-[180px]">
			<CardHeader className="p-0 pb-2">
				<CardTitle className="font-semibold text-sm mb-1">
					{model.name}
				</CardTitle>
			</CardHeader>
			<CardContent className="p-0">
				<div className="text-xs text-muted-foreground mb-1">
					{model.provider}
				</div>
				<div className="font-mono text-base">
					{format.number(model.score, {
						minimumFractionDigits: 1,
						maximumFractionDigits: 1,
					})}%
				</div>
			</CardContent>
		</Card>
	);
}

interface BenchmarkDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	benchmarkName: string;
	data: Array<{
		name: string;
		provider: string;
		providerColor?: string | null;
		score: number;
		is_self_reported: boolean;
	}>;
}

export function BenchmarkDialog({
	open,
	onOpenChange,
	benchmarkName,
	data,
}: BenchmarkDialogProps) {
	// Limit to top 40 models for dialog
	const topModels = data.slice(0, 40);
	// Get a map of unique providers for color coding
	const uniqueProviders: string[] = Array.from(
		new Set(topModels.map((item) => item.provider))
	);
	const providerColors: Record<string, string> = {};
	const providerBaseColors = [
		"#f472b6", // pink-300
		"#60a5fa", // blue-400
		"#fb7185", // rose-400
		"#34d399", // emerald-400
		"#a78bfa", // violet-400
		"#fbbf24", // amber-400
		"#6ee7b7", // emerald-300
	];

	// Assign colors to providers (fallback if provider.colour is null)
	uniqueProviders.forEach((provider, index) => {
		const ExtendedModel = topModels.find((m) => m.provider === provider);
		providerColors[provider] =
			ExtendedModel?.providerColor ||
			providerBaseColors[index % providerBaseColors.length] ||
			"#9ca3af"; // Gray fallback color
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-5xl w-[900px] sm:w-[95vw] overflow-visible">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						{benchmarkName}
						<Badge variant="secondary">
							{data.length > 40
								? `Top 40 of ${data.length}`
								: `${data.length} models`}
						</Badge>
					</DialogTitle>
				</DialogHeader>
				<div className="w-full h-[500px] mt-4 overflow-visible">
					<ResponsiveContainer width="100%" height="100%">
						<BarChart
							data={topModels}
							layout="horizontal"
							margin={{
								top: 20,
								right: 50,
								left: 20,
								bottom: 80,
							}}
						>
							<XAxis
								dataKey="name"
								angle={-45}
								textAnchor="end"
								interval={0}
								height={80}
								tick={{ fontSize: 12 }}
								axisLine={true}
								tickLine={false}
							/>{" "}
							<YAxis
								type="number"
								domain={[
									0,
									Math.max(
										100,
										Math.ceil(
											Math.max(
												...topModels.map((d) => d.score)
											) * 1.1
										)
									),
								]}
								tick={{ fontSize: 12 }}
								axisLine={true}
								tickLine={false}
							/>{" "}
							<Tooltip
								content={<BenchmarkTooltip />}
								wrapperStyle={{ zIndex: 1000 }}
							/>
							<Bar dataKey="score" radius={[4, 4, 0, 0]}>
								{topModels.map((entry, index) => (
									<Cell
										key={`cell-${index}`}
										fill={
											entry.providerColor ||
											providerColors[entry.provider] ||
											"#9ca3af"
										}
									/>
								))}{" "}
								{/* No labels on top of bars */}
							</Bar>
						</BarChart>
					</ResponsiveContainer>
				</div>
				{/* No legends */}
			</DialogContent>
		</Dialog>
	);
}
