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
	fetchModelMetadata,
	fetchOrganizationColors,
} from "@/app/(dashboard)/gateway/usage/server-actions";

interface MetricsOverviewProps {
	timeRange: { from: string; to: string };
	range: "1h" | "1d" | "1w" | "1m" | "1y";
	colorMap: Record<string, string>;
	modelMetadata: ModelMetadataMap;
	validKeyIds?: string[];
	initialChartData?: ChartDataResult | null;
}

type MetricType = "requests" | "tokens" | "cost" | null;
type GroupBy = "model" | "key";

function parseGroup(group?: string | null): GroupBy {
	return group === "key" ? "key" : "model";
}

export default function MetricsOverview({
	timeRange,
	range,
	colorMap,
	modelMetadata,
	validKeyIds = [],
	initialChartData = null,
}: MetricsOverviewProps) {
	const [keyFilter] = useQueryState("key");
	const [groupBy] = useQueryState<GroupBy>("group", {
		defaultValue: "model",
		parse: parseGroup,
		serialize: (value) => value,
	});
	const [chartData, setChartData] = useState<ChartDataResult | null>(initialChartData);
	const [resolvedColorMap, setResolvedColorMap] = useState<Record<string, string>>(colorMap);
	const [resolvedModelMetadata, setResolvedModelMetadata] =
		useState<ModelMetadataMap>(new Map(modelMetadata));
	const resolvedColorMapRef = React.useRef<Record<string, string>>(colorMap);
	const resolvedModelMetadataRef = React.useRef<ModelMetadataMap>(
		new Map(modelMetadata),
	);
	const [loading, setLoading] = useState(initialChartData == null);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [selectedMetric, setSelectedMetric] = useState<MetricType>(null);
	const normalizedKeyFilter =
		groupBy === "key" && keyFilter && validKeyIds.includes(keyFilter)
			? keyFilter
			: null;
	const chartCacheRef = React.useRef(new Map<string, ChartDataResult>());
	const chartCacheKey = `${timeRange.from}:${timeRange.to}:${range}:${normalizedKeyFilter ?? ""}`;

	useEffect(() => {
		if (initialChartData) {
			chartCacheRef.current.set(chartCacheKey, initialChartData);
		}
	}, [chartCacheKey, initialChartData]);

	useEffect(() => {
		const hydrateChartMetadata = async (data: ChartDataResult) => {
			const modelIds = Array.from(
				new Set(
					[
						...data.requestsChart,
						...data.tokensChart,
						...data.costChart,
					].flatMap((row) =>
						Object.keys(row).filter((key) => key !== "bucket"),
					),
				),
			);

			if (modelIds.length > 0) {
				const missingColorModelIds = modelIds.filter(
					(modelId) => !(modelId in resolvedColorMapRef.current),
				);
				const missingMetadataModelIds = modelIds.filter(
					(modelId) => !resolvedModelMetadataRef.current.has(modelId),
				);
				const [liveColors, liveMetadata] = await Promise.all([
					missingColorModelIds.length > 0
						? fetchOrganizationColors(missingColorModelIds)
						: Promise.resolve(new Map<string, string>()),
					missingMetadataModelIds.length > 0
						? fetchModelMetadata(missingMetadataModelIds)
						: Promise.resolve(new Map()),
				]);
				if (liveColors.size > 0) {
					setResolvedColorMap((prev) => ({
						...prev,
						...Object.fromEntries(liveColors),
					}));
				}
				if (liveMetadata.size > 0) {
					setResolvedModelMetadata((prev) => {
						const merged = new Map(prev);
						for (const [key, value] of liveMetadata.entries()) {
							merged.set(key, value);
						}
						return merged;
					});
				}
			}
		};

		const fetchData = async () => {
			const cached = chartCacheRef.current.get(chartCacheKey);
			if (cached) {
				setChartData(cached);
				setLoading(false);
				void hydrateChartMetadata(cached);
				return;
			}

			setLoading(true);
			try {
				const data = await fetchChartData({
					timeRange,
					range,
					keyFilter: normalizedKeyFilter,
				});
				chartCacheRef.current.set(chartCacheKey, data);
				setChartData(data);
				await hydrateChartMetadata(data);
			} catch (error) {
				console.error("Error fetching chart data:", error);
				setChartData(null);
			} finally {
				setLoading(false);
			}
		};

		fetchData();
	}, [
		chartCacheKey,
		timeRange,
		range,
		normalizedKeyFilter,
	]);

	useEffect(() => {
		setResolvedColorMap(colorMap);
	}, [colorMap]);

	useEffect(() => {
		resolvedColorMapRef.current = resolvedColorMap;
	}, [resolvedColorMap]);

	useEffect(() => {
		setResolvedModelMetadata(new Map(modelMetadata));
	}, [modelMetadata]);

	useEffect(() => {
		resolvedModelMetadataRef.current = resolvedModelMetadata;
	}, [resolvedModelMetadata]);

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
					colorMap={resolvedColorMap}
					modelMetadata={resolvedModelMetadata}
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
					colorMap={resolvedColorMap}
					modelMetadata={resolvedModelMetadata}
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
					colorMap={resolvedColorMap}
					modelMetadata={resolvedModelMetadata}
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
					colorMap={resolvedColorMap}
					format={formatNumber}
					modelMetadata={resolvedModelMetadata}
				/>
			)}

			{selectedMetric === "tokens" && (
				<MetricDetailDialog
					open={dialogOpen}
					onOpenChange={setDialogOpen}
					title="Tokens Breakdown"
					metric="tokens"
					chartData={chartData.tokensChart}
					colorMap={resolvedColorMap}
					format={formatNumber}
					modelMetadata={resolvedModelMetadata}
				/>
			)}

			{selectedMetric === "cost" && (
				<MetricDetailDialog
					open={dialogOpen}
					onOpenChange={setDialogOpen}
					title="Cost Breakdown"
					metric="cost"
					chartData={chartData.costChart}
					colorMap={resolvedColorMap}
					format={formatCost}
					modelMetadata={resolvedModelMetadata}
				/>
			)}
		</>
	);
}

