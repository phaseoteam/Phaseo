"use client";

import React, { useState, useEffect } from "react";
import { useQueryState } from "nuqs";
import RequestsChart from "./RequestsChart";
import TokensChart from "./TokensChart";
import CostChart from "./CostChart";
import ChartDetailDialog from "./ChartDetailDialog";
import {
	fetchChartData,
	ChartDataResult,
} from "@/app/(dashboard)/gateway/usage/server-actions";

interface UsageChartGridProps {
	timeRange: { from: string; to: string };
	range: "1h" | "1d" | "1w" | "1m" | "1y";
	colorMap: Map<string, string>;
}

export default function UsageChartGrid({
	timeRange,
	range,
	colorMap,
}: UsageChartGridProps) {
	const [keyFilter] = useQueryState("key");
	const [chartData, setChartData] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);

	// Dialog state
	const [dialogOpen, setDialogOpen] = useState(false);
	const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
	const [selectedBreakdown, setSelectedBreakdown] = useState<
		Record<string, { requests: number; tokens: number; cost: number }> | null
	>(null);
	const [dialogMetric, setDialogMetric] = useState<"requests" | "tokens" | "cost">("requests");

	// Fetch chart data
	useEffect(() => {
		const fetchData = async () => {
			setLoading(true);
			try {
				const data = await fetchChartData({
					timeRange,
					range,
					keyFilter: keyFilter || null,
				});
				setChartData(data as any);
			} catch (error) {
				console.error("Error fetching chart data:", error);
				setChartData([]);
			} finally {
				setLoading(false);
			}
		};

		fetchData();
	}, [timeRange, range, keyFilter]);

	// Transform data for each chart type
	const requestsData = React.useMemo(() => {
		return chartData.map((point) => {
			const row: { bucket: string; [modelId: string]: string | number } = { bucket: point.bucket };
			Object.entries(point.modelBreakdown).forEach(([modelId, data]) => {
				row[modelId] = (data as any).requests;
			});
			return row;
		});
	}, [chartData]);

	const tokensData = React.useMemo(() => {
		return chartData.map((point) => {
			const row: { bucket: string; [modelId: string]: string | number } = { bucket: point.bucket };
			Object.entries(point.modelBreakdown).forEach(([modelId, data]) => {
				row[modelId] = (data as any).tokens;
			});
			return row;
		});
	}, [chartData]);

	const costData = React.useMemo(() => {
		return chartData.map((point) => {
			const row: { bucket: string; [modelId: string]: string | number } = { bucket: point.bucket };
			Object.entries(point.modelBreakdown).forEach(([modelId, data]) => {
				row[modelId] = (data as any).cost;
			});
			return row;
		});
	}, [chartData]);

	const handleBarClick = (bucket: string, metric: "requests" | "tokens" | "cost") => {
		const dataPoint = chartData.find((d) => d.bucket === bucket);
		if (dataPoint) {
			setSelectedBucket(bucket);
			setSelectedBreakdown(dataPoint.modelBreakdown);
			setDialogMetric(metric);
			setDialogOpen(true);
		}
	};

	if (loading) {
		return (
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
				<div className="h-[400px] rounded-lg border bg-card animate-pulse" />
				<div className="h-[400px] rounded-lg border bg-card animate-pulse" />
				<div className="h-[400px] rounded-lg border bg-card animate-pulse" />
			</div>
		);
	}

	return (
		<>
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
				<RequestsChart
					data={requestsData}
					colorMap={colorMap}
					onBarClick={(bucket) => handleBarClick(bucket, "requests")}
				/>
				<TokensChart
					data={tokensData}
					colorMap={colorMap}
					onBarClick={(bucket) => handleBarClick(bucket, "tokens")}
				/>
				<CostChart
					data={costData}
					colorMap={colorMap}
					onBarClick={(bucket) => handleBarClick(bucket, "cost")}
				/>
			</div>

			<ChartDetailDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				bucket={selectedBucket}
				breakdown={selectedBreakdown}
				metric={dialogMetric}
			/>
		</>
	);
}
