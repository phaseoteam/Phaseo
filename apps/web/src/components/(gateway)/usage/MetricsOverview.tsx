"use client";

import React, { useState, useEffect } from "react";
import { useQueryState } from "nuqs";
import { Activity, Coins, Zap } from "lucide-react";
import MetricChartCard from "./MetricChartCard";
import MetricDetailDialog from "./MetricDetailDialog";
import {
	fetchChartData,
	ChartDataResult,
} from "@/app/(dashboard)/gateway/usage/server-actions";

interface MetricsOverviewProps {
	timeRange: { from: string; to: string };
	range: "1h" | "1d" | "1w" | "1m" | "1y";
	colorMap: Record<string, string>;
}

type MetricType = "requests" | "tokens" | "cost" | null;

export default function MetricsOverview({
	timeRange,
	range,
	colorMap,
}: MetricsOverviewProps) {
	const [keyFilter] = useQueryState("key");
	const [chartData, setChartData] = useState<ChartDataResult | null>(null);
	const [loading, setLoading] = useState(true);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [selectedMetric, setSelectedMetric] = useState<MetricType>(null);

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
				setChartData(data);
			} catch (error) {
				console.error("Error fetching chart data:", error);
				setChartData(null);
			} finally {
				setLoading(false);
			}
		};

		fetchData();
	}, [timeRange, range, keyFilter]);

	const handleCardClick = (metric: MetricType) => {
		setSelectedMetric(metric);
		setDialogOpen(true);
	};

	// Format functions
	const formatNumber = (value: number) => value.toLocaleString();
	const formatCost = (value: number) => `$${value.toFixed(5)}`;

	// Convert provider breakdown to dialog format
	const getProviderData = (metric: "requests" | "tokens" | "cost") => {
		if (!chartData?.providerBreakdown) return [];

		return Array.from(chartData.providerBreakdown.entries())
			.map(([providerId, metrics]) => {
				const modelData = Array.from(metrics.models.entries()).map(([modelId, modelMetrics]) => {
					const values = [modelMetrics[metric]];
					return {
						modelId,
						total: modelMetrics[metric],
						avg: modelMetrics[metric] / modelMetrics.requests,
						min: Math.min(...values),
						max: Math.max(...values),
						count: modelMetrics.requests,
					};
				});

				const allValues = modelData.map((m) => m.total);
				return {
					providerId,
					total: metrics[metric],
					avg: metrics[metric] / metrics.requests,
					min: Math.min(...allValues),
					max: Math.max(...allValues),
					models: modelData.sort((a, b) => b.total - a.total),
				};
			})
			.sort((a, b) => b.total - a.total);
	};

	if (loading) {
		return (
			<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
				<div className="h-[280px] rounded-lg border bg-card animate-pulse" />
				<div className="h-[280px] rounded-lg border bg-card animate-pulse" />
				<div className="h-[280px] rounded-lg border bg-card animate-pulse" />
			</div>
		);
	}

	if (!chartData) {
		return null;
	}

	return (
		<>
			<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
				{/* Requests Card */}
				<MetricChartCard
					title="Requests"
					icon={Activity}
					currentValue={chartData.totals.requests.current}
					previousValue={chartData.totals.requests.previous}
					avgValue={chartData.totals.requests.avg}
					format={formatNumber}
					chartData={chartData.requestsChart}
					colorMap={colorMap}
					onClick={() => handleCardClick("requests")}
					metricType="number"
				/>

				{/* Tokens Card */}
				<MetricChartCard
					title="Tokens"
					icon={Zap}
					currentValue={chartData.totals.tokens.current}
					previousValue={chartData.totals.tokens.previous}
					avgValue={chartData.totals.tokens.avg}
					format={formatNumber}
					chartData={chartData.tokensChart}
					colorMap={colorMap}
					onClick={() => handleCardClick("tokens")}
					metricType="number"
				/>

				{/* Cost Card */}
				<MetricChartCard
					title="Cost"
					icon={Coins}
					currentValue={chartData.totals.cost.current}
					previousValue={chartData.totals.cost.previous}
					avgValue={chartData.totals.cost.avg}
					format={formatCost}
					chartData={chartData.costChart}
					colorMap={colorMap}
					onClick={() => handleCardClick("cost")}
					metricType="currency"
				/>
			</div>

			{/* Detail Dialogs */}
			{selectedMetric === "requests" && (
				<MetricDetailDialog
					open={dialogOpen}
					onOpenChange={setDialogOpen}
					title="Requests Breakdown"
					metric="requests"
					chartData={chartData.requestsChart}
					providerData={getProviderData("requests")}
					colorMap={colorMap}
					format={formatNumber}
				/>
			)}

			{selectedMetric === "tokens" && (
				<MetricDetailDialog
					open={dialogOpen}
					onOpenChange={setDialogOpen}
					title="Tokens Breakdown"
					metric="tokens"
					chartData={chartData.tokensChart}
					providerData={getProviderData("tokens")}
					colorMap={colorMap}
					format={formatNumber}
				/>
			)}

			{selectedMetric === "cost" && (
				<MetricDetailDialog
					open={dialogOpen}
					onOpenChange={setDialogOpen}
					title="Cost Breakdown"
					metric="cost"
					chartData={chartData.costChart}
					providerData={getProviderData("cost")}
					colorMap={colorMap}
					format={formatCost}
				/>
			)}
		</>
	);
}
