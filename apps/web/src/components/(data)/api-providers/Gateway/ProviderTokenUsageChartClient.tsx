"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChartContainer } from "@/components/ui/chart";
import {
	assignSeriesColours,
	keyForSeries,
} from "@/components/(rankings)/chart-colors";
import type {
	ProviderTokenSeriesModel,
	ProviderTokenSeriesPoint,
} from "@/lib/fetchers/api-providers/providerDataTypes";
import type {
	ProviderAppSeriesApp,
	ProviderAppSeriesPoint,
} from "@/lib/fetchers/api-providers/providerDataTypes";

type ProviderTokenUsageChartClientProps = {
	models: ProviderTokenSeriesModel[];
	points: ProviderTokenSeriesPoint[];
	apps?: ProviderAppSeriesApp[];
	appPoints?: ProviderAppSeriesPoint[];
	showLinkedTables?: boolean;
};

function formatCompact(value: number) {
	if (!Number.isFinite(value)) return "--";
	if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
	if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
	return value.toLocaleString();
}

function formatBucketLabel(value: string) {
	const date = new Date(`${value}T00:00:00.000Z`);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ProviderTokenUsageChartClient({
	models,
	points,
	apps = [],
	appPoints = [],
	showLinkedTables = true,
}: ProviderTokenUsageChartClientProps) {
	const [hoveredBucket, setHoveredBucket] = useState<string | null>(null);
	const [hoveredModelId, setHoveredModelId] = useState<string | null>(null);

	const chartModelIds = models.map((model) => model.modelId);
	const keysByModelId = useMemo(
		() =>
			Object.fromEntries(
				chartModelIds.map((modelId) => [modelId, keyForSeries(modelId)]),
			) as Record<string, string>,
		[chartModelIds],
	);
	const modelIdBySeriesKey = useMemo(
		() =>
			new Map(
				chartModelIds.map((modelId) => [keysByModelId[modelId], modelId]),
			),
		[chartModelIds, keysByModelId],
	);

	const colors = useMemo(() => assignSeriesColours(chartModelIds), [chartModelIds]);

	const chartData = useMemo(() => {
		const buckets = Array.from(new Set(points.map((point) => point.bucket))).sort();
		const rowByBucket = new Map<string, Record<string, number | string>>();

		for (const bucket of buckets) {
			rowByBucket.set(bucket, { bucket });
		}

		for (const point of points) {
			const key = keysByModelId[point.modelId];
			if (!key) continue;
			const row = rowByBucket.get(point.bucket);
			if (!row) continue;
			row[key] = point.tokens;
		}

		for (const row of rowByBucket.values()) {
			let totalTokens = 0;
			for (const modelId of chartModelIds) {
				const key = keysByModelId[modelId];
				const value = Number(row[key] ?? 0);
				row[key] = Number.isFinite(value) ? value : 0;
				totalTokens += Number(row[key] ?? 0);
			}
			row.totalTokens = totalTokens;
		}

		return buckets
			.map((bucket) => rowByBucket.get(bucket))
			.filter((row): row is Record<string, number | string> => Boolean(row));
	}, [chartModelIds, keysByModelId, points]);

	const chartConfig = useMemo(
		() =>
			Object.fromEntries(
				models.map((model) => {
					const key = keysByModelId[model.modelId];
					return [
						key,
						{
							label: model.modelName,
							color: colors[model.modelId]?.fill ?? "hsl(210 70% 75%)",
						},
					];
				}),
			),
		[colors, keysByModelId, models],
	);

	const modelNameById = useMemo(
		() => new Map(models.map((model) => [model.modelId, model.modelName])),
		[models],
	);

	const modelTokensByBucket = useMemo(() => {
		const bucketMap = new Map<string, Map<string, number>>();
		for (const point of points) {
			const modelMap = bucketMap.get(point.bucket) ?? new Map<string, number>();
			modelMap.set(point.modelId, point.tokens);
			bucketMap.set(point.bucket, modelMap);
		}
		return bucketMap;
	}, [points]);

	const appTokensByBucket = useMemo(() => {
		const bucketMap = new Map<string, Map<string, number>>();
		for (const point of appPoints) {
			const appMap = bucketMap.get(point.bucket) ?? new Map<string, number>();
			appMap.set(point.appId, point.tokens);
			bucketMap.set(point.bucket, appMap);
		}
		return bucketMap;
	}, [appPoints]);

	const buckets = useMemo(
		() =>
			chartData
				.map((row) =>
					typeof row.bucket === "string" ? row.bucket : null,
				)
				.filter((bucket): bucket is string => Boolean(bucket)),
		[chartData],
	);
	const bucketSet = useMemo(() => new Set(buckets), [buckets]);

	const hasBucket = (bucket: string | null): boolean =>
		Boolean(bucket && bucketSet.has(bucket));

	const totalTokensByBucket = useMemo(
		() =>
			new Map(
				chartData.map((row) => [
					String(row.bucket),
					Number(row.totalTokens ?? 0),
				]),
			),
		[chartData],
	);
	const activeBucket = hasBucket(hoveredBucket) ? hoveredBucket : null;
	const aggregateTotalTokens = useMemo(
		() =>
			Array.from(totalTokensByBucket.values()).reduce(
				(sum, value) => sum + value,
				0,
			),
		[totalTokensByBucket],
	);
	const aggregateModelTokens = useMemo(() => {
		const totals = new Map<string, number>();
		for (const point of points) {
			totals.set(point.modelId, (totals.get(point.modelId) ?? 0) + point.tokens);
		}
		return totals;
	}, [points]);
	const aggregateAppTokens = useMemo(() => {
		const totals = new Map<string, number>();
		for (const point of appPoints) {
			totals.set(point.appId, (totals.get(point.appId) ?? 0) + point.tokens);
		}
		return totals;
	}, [appPoints]);
	const aggregateRangeLabel = useMemo(() => {
		if (!buckets.length) return "this period";
		const first = buckets[0];
		const last = buckets[buckets.length - 1];
		if (first === last) return formatBucketLabel(first);
		return `${formatBucketLabel(first)} - ${formatBucketLabel(last)}`;
	}, [buckets]);

	const activeTotalTokens = useMemo(() => {
		if (activeBucket) return totalTokensByBucket.get(activeBucket) ?? 0;
		return aggregateTotalTokens;
	}, [activeBucket, aggregateTotalTokens, totalTokensByBucket]);

	const resolveBucketFromChartState = (state: any): string | null => {
		const payloadBucket = state?.activePayload?.find(
			(entry: any) => typeof entry?.payload?.bucket === "string",
		)?.payload?.bucket;
		if (typeof payloadBucket === "string" && hasBucket(payloadBucket)) {
			return payloadBucket;
		}

		if (typeof state?.activeLabel === "string" && hasBucket(state.activeLabel)) {
			return state.activeLabel;
		}

		if (Number.isInteger(state?.activeTooltipIndex)) {
			const idx = Number(state.activeTooltipIndex);
			const indexedBucket = chartData[idx]?.bucket;
			if (typeof indexedBucket === "string" && hasBucket(indexedBucket)) {
				return indexedBucket;
			}
		}

		return null;
	};

	const resolveBucketFromBarState = (state: any): string | null => {
		const directPayloadBucket = state?.payload?.bucket;
		if (typeof directPayloadBucket === "string" && hasBucket(directPayloadBucket)) {
			return directPayloadBucket;
		}

		const nestedPayloadBucket = state?.payload?.payload?.bucket;
		if (typeof nestedPayloadBucket === "string" && hasBucket(nestedPayloadBucket)) {
			return nestedPayloadBucket;
		}

		return resolveBucketFromChartState(state);
	};
	const resolveModelIdFromChartState = (state: any): string | null => {
		if (typeof state?.activeDataKey !== "string") return null;
		return modelIdBySeriesKey.get(state.activeDataKey) ?? null;
	};

	const activeModelRows = useMemo(() => {
		const modelMap = activeBucket
			? modelTokensByBucket.get(activeBucket) ?? new Map<string, number>()
			: aggregateModelTokens;
		return models
			.map((model) => ({
				id: model.modelId,
				label: model.modelName,
				tokens: modelMap.get(model.modelId) ?? 0,
			}))
			.filter((row) => row.tokens > 0)
			.sort((a, b) => b.tokens - a.tokens)
			.slice(0, 6);
	}, [activeBucket, aggregateModelTokens, modelTokensByBucket, models]);

	const activeAppRows = useMemo(() => {
		const appMap = activeBucket
			? appTokensByBucket.get(activeBucket) ?? new Map<string, number>()
			: aggregateAppTokens;
		return apps
			.map((app) => ({
				id: app.appId,
				title: app.title,
				url: app.url,
				imageUrl: app.imageUrl,
				tokens: appMap.get(app.appId) ?? 0,
			}))
			.filter((row) => row.tokens > 0)
			.sort((a, b) => b.tokens - a.tokens)
			.slice(0, 20);
	}, [activeBucket, aggregateAppTokens, appTokensByBucket, apps]);

	return (
		<div className="space-y-4">
			<ChartContainer config={chartConfig} className="h-[360px] w-full">
				<BarChart
					data={chartData}
					margin={{ top: 8, right: 12, left: 0, bottom: 12 }}
					onMouseMove={(state: any) => {
						const bucket = resolveBucketFromChartState(state);
						const modelId = resolveModelIdFromChartState(state);
						if (bucket) {
							setHoveredBucket(bucket);
						} else if (!state?.isTooltipActive) {
							setHoveredBucket(null);
						}
						setHoveredModelId(modelId);
					}}
					onMouseLeave={() => {
						setHoveredBucket(null);
						setHoveredModelId(null);
					}}
				>
					<CartesianGrid vertical={false} className="stroke-muted" />
					<XAxis
						dataKey="bucket"
						tickFormatter={(value) => formatBucketLabel(String(value))}
						tickLine={false}
						axisLine={false}
						minTickGap={24}
						interval="preserveStartEnd"
					/>
					<YAxis
						tickFormatter={(value) => formatCompact(Number(value))}
						tickLine={false}
						axisLine={false}
						width={56}
					/>
					<RechartsTooltip
						cursor={{
							stroke: "hsl(var(--border))",
							strokeWidth: 1,
							strokeDasharray: "4 4",
						}}
						content={() => null}
						isAnimationActive={false}
					/>
					{models.map((model, index) => {
						const key = keysByModelId[model.modelId];
						const isDimmed = Boolean(hoveredModelId && hoveredModelId !== model.modelId);
						return (
							<Bar
								key={model.modelId}
								dataKey={key}
								name={model.modelName}
								stackId="tokens"
								fill={`var(--color-${key}, ${colors[model.modelId]?.fill ?? "hsl(210 70% 75%)"})`}
								fillOpacity={isDimmed ? 0.35 : 1}
								stroke={
									hoveredModelId === model.modelId
										? "hsl(var(--foreground))"
										: "transparent"
								}
								strokeWidth={hoveredModelId === model.modelId ? 1 : 0}
								radius={index === models.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
								isAnimationActive={false}
								onMouseMove={(state: any) => {
									const bucket = resolveBucketFromBarState(state);
									if (bucket) setHoveredBucket(bucket);
									setHoveredModelId(model.modelId);
								}}
								onMouseLeave={() => setHoveredModelId(null)}
							/>
						);
					})}
				</BarChart>
			</ChartContainer>

			{showLinkedTables ? (
				<>
						<div className="text-xs text-muted-foreground">
							{activeBucket
								? `Showing ${formatBucketLabel(activeBucket)} | Total ${formatCompact(activeTotalTokens)}${hoveredModelId ? ` | Hovering ${modelNameById.get(hoveredModelId) ?? hoveredModelId}` : ""}`
								: `Showing ${aggregateRangeLabel} aggregate | Total ${formatCompact(activeTotalTokens)}`}
						</div>

					<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
						<section className="space-y-3">
							<h3 className="text-xl font-semibold">Top Models</h3>
							<div className="overflow-x-auto">
								<table className="w-full min-w-[480px] text-sm">
									<thead>
										<tr className="border-b border-border text-xs text-muted-foreground">
											<th className="px-2 py-2 text-left font-medium">Model</th>
											<th className="px-2 py-2 text-right font-medium">Tokens</th>
										</tr>
									</thead>
									<tbody>
											{activeModelRows.length > 0 ? (
												activeModelRows.map((model) => (
													<tr
														key={model.id}
														className={`border-b border-border/60 last:border-b-0 hover:bg-muted/20 ${hoveredModelId === model.id ? "bg-muted/25" : ""} ${
															hoveredModelId && hoveredModelId !== model.id
																? "text-muted-foreground/65"
																: ""
														}`}
													>
														<td className="min-w-0 px-2 py-2">
															<Link
																href={`/models/${model.id}`}
																prefetch={false}
																className={`truncate font-medium underline decoration-transparent underline-offset-2 transition-colors hover:text-primary hover:decoration-current ${
																	hoveredModelId && hoveredModelId !== model.id
																		? "text-muted-foreground/65"
																		: "text-foreground"
																}`}
															>
																{model.label}
															</Link>
														</td>
														<td
															className={`px-2 py-2 text-right tabular-nums ${
																hoveredModelId && hoveredModelId !== model.id
																	? "text-muted-foreground/65"
																	: "text-foreground"
															}`}
														>
															{model.tokens.toLocaleString()}
														</td>
													</tr>
												))
										) : (
											<tr>
												<td
													colSpan={2}
													className="px-2 py-6 text-center text-xs text-muted-foreground"
												>
													{activeBucket
														? "0 tokens for this day."
														: "0 tokens in this period."}
												</td>
											</tr>
										)}
									</tbody>
								</table>
							</div>
						</section>

						<section className="space-y-3">
							<h3 className="text-xl font-semibold">Top Apps</h3>
							<div className="overflow-x-auto">
								<table className="w-full min-w-[560px] text-sm">
									<thead>
										<tr className="border-b border-border text-xs text-muted-foreground">
											<th className="px-2 py-2 text-left font-medium">App</th>
											<th className="px-2 py-2 text-right font-medium">Tokens</th>
											<th className="px-2 py-2 text-right font-medium">Website</th>
										</tr>
									</thead>
									<tbody>
										{activeAppRows.length > 0 ? (
											activeAppRows.map((app) => (
												<tr
													key={app.id}
													className="border-b border-border/60 last:border-b-0 hover:bg-muted/20"
												>
													<td className="min-w-0 px-2 py-2">
														<Link
															href={`/apps/${app.id}`}
															className="group flex min-w-0 items-center gap-2"
														>
															<Avatar className="h-5 w-5 rounded-md border border-border/60">
																<AvatarImage
																	src={app.imageUrl ?? undefined}
																	alt={app.title}
																	className="object-cover"
																/>
																<AvatarFallback className="rounded-md text-[10px] font-semibold">
																	{app.title.slice(0, 1).toUpperCase()}
																</AvatarFallback>
															</Avatar>
															<span className="truncate font-medium text-foreground underline decoration-transparent underline-offset-2 transition-colors group-hover:text-primary group-hover:decoration-current">
																{app.title}
															</span>
														</Link>
													</td>
													<td className="px-2 py-2 text-right tabular-nums">
														{app.tokens.toLocaleString()}
													</td>
													<td className="px-2 py-2 text-right">
														{app.url && app.url !== "about:blank" ? (
															<a
																href={app.url}
																target="_blank"
																rel="noopener noreferrer"
																className="text-xs font-medium text-foreground underline decoration-transparent underline-offset-2 transition-colors hover:text-primary hover:decoration-current"
															>
																Visit
															</a>
														) : (
															<span className="text-xs text-muted-foreground">-</span>
														)}
													</td>
												</tr>
											))
										) : (
											<tr>
												<td
													colSpan={3}
													className="px-2 py-6 text-center text-xs text-muted-foreground"
												>
													{activeBucket
														? "0 tokens for this day."
														: "0 tokens in this period."}
												</td>
											</tr>
										)}
									</tbody>
								</table>
							</div>
						</section>
					</div>
				</>
			) : null}
		</div>
	);
}
