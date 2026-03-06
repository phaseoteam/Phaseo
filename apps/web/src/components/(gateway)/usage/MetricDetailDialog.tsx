"use client";

import React, { useEffect, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Download } from "lucide-react";
import { ChartContainer } from "@/components/ui/chart";
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
import { exportToCSV, exportToPDF } from "./export-utils";
import { EnhancedChartTooltip } from "./EnhancedChartTooltip";
import { OTHER_SERIES_KEY, reduceChartSeries } from "./chartSeries";
import { getModelDisplayName, type ModelMetadataMap } from "./model-display";

interface MetricDetailDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	metric: "requests" | "tokens" | "cost";
	chartData: Array<{
		bucket: string;
		[key: string]: number | string;
	}>;
	colorMap: Record<string, string>;
	format: (value: number) => string;
	modelMetadata: ModelMetadataMap;
}

type TopModelRow = {
	modelId: string;
	modelLabel: string;
	sum: number;
	avg: number;
	min: number;
	max: number;
};

function hash32(str: string) {
	let h = 0x811c9dc5 >>> 0;
	for (let i = 0; i < str.length; i++) {
		h ^= str.charCodeAt(i);
		h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
	}
	return h >>> 0;
}

function getColor(id: string, colorMap: Record<string, string>) {
	if (id === OTHER_SERIES_KEY) {
		return "hsl(0 0% 72% / 0.78)";
	}
	const orgColor = colorMap[id];
	if (orgColor) return orgColor;
	const hue = hash32(id) % 360;
	return `hsl(${hue} 45% 78% / 0.88)`;
}

export default function MetricDetailDialog({
	open,
	onOpenChange,
	title,
	metric,
	chartData,
	colorMap,
	format,
	modelMetadata,
}: MetricDetailDialogProps) {
	const [activeSeriesKey, setActiveSeriesKey] = useState<string | null>(null);
	const [showHeavyContent, setShowHeavyContent] = useState(false);

	const reduced = React.useMemo(() => reduceChartSeries(chartData, 24), [chartData]);
	const displayChartData = reduced.rows;
	const seriesKeys = reduced.seriesKeys;

	useEffect(() => {
		if (!open) {
			setShowHeavyContent(false);
			return;
		}
		const raf = window.requestAnimationFrame(() => {
			setShowHeavyContent(true);
		});
		return () => window.cancelAnimationFrame(raf);
	}, [open, metric, title]);

	const chartConfig = React.useMemo(() => {
		const config: Record<string, { label: string; color: string }> = {};
		seriesKeys.forEach((key) => {
			config[key] = {
				label: key === OTHER_SERIES_KEY ? "Other" : getModelDisplayName(key, modelMetadata),
				color: getColor(key, colorMap),
			};
		});
		return config;
	}, [seriesKeys, colorMap, modelMetadata]);

	const topModels = React.useMemo(() => {
		if (!chartData.length) return [] as TopModelRow[];

		const modelKeys = new Set<string>();
		for (const row of chartData) {
			for (const key of Object.keys(row)) {
				if (key === "bucket") continue;
				modelKeys.add(key);
			}
		}

		const bucketCount = Math.max(chartData.length, 1);

		const rows: TopModelRow[] = Array.from(modelKeys).map((modelId) => {
			let sum = 0;
			let min = Number.POSITIVE_INFINITY;
			let max = Number.NEGATIVE_INFINITY;

			for (const bucketRow of chartData) {
				const raw = bucketRow[modelId];
				const n = Number(raw ?? 0);
				const value = Number.isFinite(n) ? n : 0;
				sum += value;
				if (value < min) min = value;
				if (value > max) max = value;
			}

			const modelLabel = getModelDisplayName(modelId, modelMetadata);

			return {
				modelId,
				modelLabel,
				sum,
				avg: sum / bucketCount,
				min: Number.isFinite(min) ? min : 0,
				max: Number.isFinite(max) ? max : 0,
			};
		});

		return rows.sort((a, b) => b.sum - a.sum).slice(0, 25);
	}, [chartData, modelMetadata]);

	const handleExport = (exportFormat: "csv" | "pdf") => {
		const exportRows = topModels.map((model) => ({
			Model: model.modelLabel,
			ModelId: model.modelId,
			Min: model.min,
			Max: model.max,
			Average: model.avg.toFixed(2),
			Sum: model.sum,
		}));

		const timestamp = new Date().toISOString().split("T")[0];
		const filename = `${title.toLowerCase().replace(/\s+/g, "-")}-${timestamp}`;

		if (exportFormat === "csv") {
			exportToCSV(exportRows, filename);
		} else {
			exportToPDF(exportRows, filename, title);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-7xl max-h-[90vh] overflow-hidden flex flex-col">
				<DialogHeader>
					<div className="flex items-center justify-between pr-8">
						<DialogTitle>{title}</DialogTitle>
						<div className="flex gap-2">
							<Button variant="outline" size="sm" onClick={() => handleExport("csv")}>
								<Download className="mr-2 h-4 w-4" />
								CSV
							</Button>
							<Button variant="outline" size="sm" onClick={() => handleExport("pdf")}>
								<Download className="mr-2 h-4 w-4" />
								PDF
							</Button>
						</div>
					</div>
				</DialogHeader>

				{showHeavyContent ? (
					<div className="flex-1 overflow-auto space-y-6">
						<div className="h-[420px]">
							<ChartContainer config={chartConfig} className="h-full w-full">
								<BarChart
									data={displayChartData}
									margin={{ left: 12, right: 12, top: 10, bottom: 10 }}
									onMouseLeave={() => setActiveSeriesKey(null)}
								>
									<CartesianGrid vertical={false} />
									<XAxis
										dataKey="bucket"
										tickLine={false}
										axisLine={false}
										tick={{ fontSize: 12 }}
									/>
									<YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
									<Tooltip
										content={(props) => (
											<EnhancedChartTooltip
												{...props}
												format={format}
												getColor={(key) => getColor(key, colorMap)}
												activeKey={activeSeriesKey}
											/>
										)}
										cursor={{ fill: "hsl(var(--muted))", opacity: 0.15 }}
									/>
									{seriesKeys.map((key) => (
										<Bar
											key={key}
											dataKey={key}
											name={key === OTHER_SERIES_KEY ? "Other" : getModelDisplayName(key, modelMetadata)}
											stackId="a"
											fill={getColor(key, colorMap)}
											radius={[4, 4, 0, 0]}
											onMouseEnter={() => setActiveSeriesKey(key)}
											onMouseLeave={() => setActiveSeriesKey(null)}
										/>
									))}
								</BarChart>
							</ChartContainer>
						</div>

						<div className="rounded-md border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="w-[40%]">Model</TableHead>
										<TableHead className="text-right">Min</TableHead>
										<TableHead className="text-right">Max</TableHead>
										<TableHead className="text-right">Avg</TableHead>
										<TableHead className="text-right">Sum</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{topModels.map((model) => (
										<TableRow key={model.modelId}>
											<TableCell className="font-medium">
												<span>{model.modelLabel}</span>
											</TableCell>
											<TableCell className="text-right font-mono text-muted-foreground">{format(model.min)}</TableCell>
											<TableCell className="text-right font-mono text-muted-foreground">{format(model.max)}</TableCell>
											<TableCell className="text-right font-mono text-muted-foreground">{format(model.avg)}</TableCell>
											<TableCell className="text-right font-mono">{format(model.sum)}</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					</div>
				) : (
					<div className="flex-1 space-y-4">
						<div className="h-[300px] rounded-md border bg-muted/30 animate-pulse" />
						<div className="h-[220px] rounded-md border bg-muted/30 animate-pulse" />
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
