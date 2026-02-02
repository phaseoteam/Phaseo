"use client";

import React, { useState } from "react";
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
import { Download, ChevronDown, ChevronRight } from "lucide-react";
import { ChartContainer } from "@/components/ui/chart";
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
import { exportToCSV, exportToPDF } from "./export-utils";
import { EnhancedChartTooltip } from "./EnhancedChartTooltip";

interface ModelBreakdown {
	modelId: string;
	total: number;
	avg: number;
	min: number;
	max: number;
	count: number;
}

interface ProviderData {
	providerId: string;
	total: number;
	avg: number;
	min: number;
	max: number;
	models: ModelBreakdown[];
}

interface MetricDetailDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	metric: "requests" | "tokens" | "cost";
	chartData: Array<{
		bucket: string;
		[key: string]: number | string;
	}>;
	providerData: ProviderData[];
	colorMap: Record<string, string>;
	format: (value: number) => string;
}

function hash32(str: string) {
	let h = 0x811c9dc5 >>> 0;
	for (let i = 0; i < str.length; i++) {
		h ^= str.charCodeAt(i);
		h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
	}
	return h >>> 0;
}

function getColor(id: string, colorMap: Record<string, string>) {
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
	providerData,
	colorMap,
	format,
}: MetricDetailDialogProps) {
	const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
	const [activeSeriesKey, setActiveSeriesKey] = useState<string | null>(null);

	const toggleRow = (providerId: string) => {
		const newExpanded = new Set(expandedRows);
		if (newExpanded.has(providerId)) {
			newExpanded.delete(providerId);
		} else {
			newExpanded.add(providerId);
		}
		setExpandedRows(newExpanded);
	};

	// Extract unique series keys
	const seriesKeys = React.useMemo(() => {
		const keys = new Set<string>();
		chartData.forEach((row) => {
			Object.keys(row).forEach((key) => {
				if (key !== "bucket") keys.add(key);
			});
		});
		return Array.from(keys);
	}, [chartData]);

	// Build chart config
	const chartConfig = React.useMemo(() => {
		const config: Record<string, { label: string; color: string }> = {};
		seriesKeys.forEach((key) => {
			config[key] = {
				label: key,
				color: getColor(key, colorMap),
			};
		});
		return config;
	}, [seriesKeys, colorMap]);

	const handleExport = (format: "csv" | "pdf") => {
		const exportData: any[] = [];

		providerData.forEach((provider) => {
			// Add provider row
			exportData.push({
				"Provider/Model": provider.providerId,
				Total: provider.total,
				Average: provider.avg.toFixed(2),
				Min: provider.min,
				Max: provider.max,
				Count: provider.models.length,
			});

			// Add model rows
			provider.models.forEach((model) => {
				exportData.push({
					"Provider/Model": `  - ${model.modelId}`,
					Total: model.total,
					Average: model.avg.toFixed(2),
					Min: model.min,
					Max: model.max,
					Count: model.count,
				});
			});
		});

		const timestamp = new Date().toISOString().split("T")[0];
		const filename = `${title.toLowerCase().replace(/\s+/g, "-")}-${timestamp}`;

		if (format === "csv") {
			exportToCSV(exportData, filename);
		} else {
			exportToPDF(exportData, filename, title);
		}
	};

	const getProviderColor = (provider: ProviderData) => {
		const firstModelId = provider.models[0]?.modelId;
		if (firstModelId) {
			const modelColor = colorMap[firstModelId];
			if (modelColor) return modelColor;
		}
		return getColor(provider.providerId, colorMap);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-7xl max-h-[90vh] overflow-hidden flex flex-col">
				<DialogHeader>
					<div className="flex items-center justify-between pr-8">
						<DialogTitle>{title}</DialogTitle>
						<div className="flex gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={() => handleExport("csv")}
							>
								<Download className="mr-2 h-4 w-4" />
								CSV
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={() => handleExport("pdf")}
							>
								<Download className="mr-2 h-4 w-4" />
								PDF
							</Button>
						</div>
					</div>
				</DialogHeader>

				<div className="flex-1 overflow-auto space-y-6">
					{/* Full-width Chart */}
					<div className="h-[300px]">
						<ChartContainer config={chartConfig} className="h-full w-full">
							<BarChart
								data={chartData}
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

					{/* Detailed Table */}
					<div className="rounded-md border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-[40%]">Provider / Model</TableHead>
									<TableHead className="text-right">Total</TableHead>
									<TableHead className="text-right">Average</TableHead>
									<TableHead className="text-right">Min</TableHead>
									<TableHead className="text-right">Max</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{providerData.map((provider) => (
									<React.Fragment key={provider.providerId}>
										{/* Provider Row */}
										<TableRow
											className="cursor-pointer hover:bg-muted/50 font-medium"
											onClick={() => toggleRow(provider.providerId)}
										>
											<TableCell>
												<div className="flex items-center gap-2">
													{provider.models.length > 0 && (
														<>
															{expandedRows.has(provider.providerId) ? (
																<ChevronDown className="h-4 w-4 text-muted-foreground" />
															) : (
																<ChevronRight className="h-4 w-4 text-muted-foreground" />
															)}
														</>
													)}
													<div
														className="w-3 h-3 rounded-sm flex-shrink-0"
														style={{ backgroundColor: getProviderColor(provider) }}
													/>
													{provider.providerId}
												</div>
											</TableCell>
											<TableCell className="text-right font-mono">
												{format(provider.total)}
											</TableCell>
											<TableCell className="text-right font-mono text-muted-foreground">
												{format(provider.avg)}
											</TableCell>
											<TableCell className="text-right font-mono text-muted-foreground">
												{format(provider.min)}
											</TableCell>
											<TableCell className="text-right font-mono text-muted-foreground">
												{format(provider.max)}
											</TableCell>
										</TableRow>

										{/* Model Rows (when expanded) */}
										{expandedRows.has(provider.providerId) &&
											provider.models.map((model) => (
												<TableRow
													key={`${provider.providerId}-${model.modelId}`}
													className="bg-muted/30"
												>
													<TableCell className="pl-12 text-sm text-muted-foreground">
														<div className="flex items-center gap-2">
															<span className="text-muted-foreground/50">-</span>
															<div
																className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
																style={{ backgroundColor: getColor(model.modelId, colorMap) }}
															/>
															{model.modelId}
														</div>
													</TableCell>
													<TableCell className="text-right font-mono text-sm">
														{format(model.total)}
													</TableCell>
													<TableCell className="text-right font-mono text-sm text-muted-foreground">
														{format(model.avg)}
													</TableCell>
													<TableCell className="text-right font-mono text-sm text-muted-foreground">
														{format(model.min)}
													</TableCell>
													<TableCell className="text-right font-mono text-sm text-muted-foreground">
														{format(model.max)}
													</TableCell>
												</TableRow>
											))}
									</React.Fragment>
								))}
							</TableBody>
						</Table>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
