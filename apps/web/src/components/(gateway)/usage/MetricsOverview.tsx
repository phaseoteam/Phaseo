"use client";

import React, { useState, useEffect } from "react";
import { useQueryState } from "nuqs";
import { Activity, Coins, Zap } from "lucide-react";
import MetricChartCard from "./MetricChartCard";
import MetricDetailDialog from "./MetricDetailDialog";
import { type ModelMetadataMap } from "./model-display";
import {
	fetchChartData,
	ChartDataResult,
} from "@/app/(dashboard)/gateway/usage/server-actions";

interface MetricsOverviewProps {
	timeRange: { from: string; to: string };
	range: "1h" | "1d" | "1w" | "1m" | "1y";
	colorMap: Record<string, string>;
	modelMetadata: ModelMetadataMap;
}

type MetricType = "requests" | "tokens" | "cost" | null;

export default function MetricsOverview({
	timeRange,
	range,
	colorMap,
	modelMetadata,
}: MetricsOverviewProps) {
	const [keyFilter] = useQueryState("key");
	const [chartData, setChartData] = useState<ChartDataResult | null>(null);
	const [loading, setLoading] = useState(true);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [selectedMetric, setSelectedMetric] = useState<MetricType>(null);

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

	const formatNumber = (value: number) => value.toLocaleString();
	const formatCost = (value: number) => `$${value.toFixed(5)}`;

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
				<MetricChartCard
					title="Requests"
					icon={Activity}
					currentValue={chartData.totals.requests.current}
					previousValue={chartData.totals.requests.previous}
					avgValue={chartData.totals.requests.avg}
					format={formatNumber}
					chartData={chartData.requestsChart}
					colorMap={colorMap}
					modelMetadata={modelMetadata}
					onClick={() => handleCardClick("requests")}
					metricType="number"
				/>

				<MetricChartCard
					title="Tokens"
					icon={Zap}
					currentValue={chartData.totals.tokens.current}
					previousValue={chartData.totals.tokens.previous}
					avgValue={chartData.totals.tokens.avg}
					format={formatNumber}
					chartData={chartData.tokensChart}
					colorMap={colorMap}
					modelMetadata={modelMetadata}
					onClick={() => handleCardClick("tokens")}
					metricType="number"
				/>

				<MetricChartCard
					title="Cost"
					icon={Coins}
					currentValue={chartData.totals.cost.current}
					previousValue={chartData.totals.cost.previous}
					avgValue={chartData.totals.cost.avg}
					format={formatCost}
					chartData={chartData.costChart}
					colorMap={colorMap}
					modelMetadata={modelMetadata}
					onClick={() => handleCardClick("cost")}
					metricType="currency"
				/>
			</div>

			{selectedMetric === "requests" && (
				<MetricDetailDialog
					open={dialogOpen}
					onOpenChange={setDialogOpen}
					title="Requests Breakdown"
					metric="requests"
					chartData={chartData.requestsChart}
					colorMap={colorMap}
					format={formatNumber}
					modelMetadata={modelMetadata}
				/>
			)}

			{selectedMetric === "tokens" && (
				<MetricDetailDialog
					open={dialogOpen}
					onOpenChange={setDialogOpen}
					title="Tokens Breakdown"
					metric="tokens"
					chartData={chartData.tokensChart}
					colorMap={colorMap}
					format={formatNumber}
					modelMetadata={modelMetadata}
				/>
			)}

			{selectedMetric === "cost" && (
				<MetricDetailDialog
					open={dialogOpen}
					onOpenChange={setDialogOpen}
					title="Cost Breakdown"
					metric="cost"
					chartData={chartData.costChart}
					colorMap={colorMap}
					format={formatCost}
					modelMetadata={modelMetadata}
				/>
			)}
		</>
	);
}

