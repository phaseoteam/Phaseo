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
} from "@/lib/fetchers/api-providers/api-provider/providerTokenTimeseries";
import type {
	ProviderAppSeriesApp,
	ProviderAppSeriesPoint,
} from "@/lib/fetchers/api-providers/api-provider/providerAppTokenTimeseries";

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

function toBucket(date: Date): string {
	return date.toISOString().slice(0, 10);
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

	const colors = useMemo(() => assignSeriesColours(chartModelIds), [chartModelIds]);

	const chartData = useMemo(() => {
		const buckets = Array.from(new Set(points.map((point) => point.bucket))).sort();
		const rowByBucket = new Map<string, Record<string, number | string>>();

		for (const bucket of buckets) {
			rowByBucket.set(bucket, {
				bucket,
				label: formatBucketLabel(bucket),
			});
		}

		for (const point of points) {
			const key = keysByModelId[point.modelId];
			if (!key) continue;
			const row = rowByBucket.get(point.bucket);
			if (!row) continue;
			row[key] = point.tokens;
		}

		for (const row of rowByBucket.values()) {
			for (const modelId of chartModelIds) {
				const key = keysByModelId[modelId];
				if (row[key] == null) row[key] = 0;
			}
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
		() => Array.from(new Set(points.map((point) => point.bucket))).sort(),
		[points],
	);

	const hasBucket = (bucket: string | null): boolean =>
		Boolean(bucket && buckets.includes(bucket));

	const todayBucket = toBucket(new Date());
	const yesterdayBucket = toBucket(new Date(Date.now() - 24 * 60 * 60 * 1000));
	const latestBucket = buckets[buckets.length - 1] ?? null;

	const activeBucket = hasBucket(hoveredBucket)
		? hoveredBucket
		: hasBucket(todayBucket)
			? todayBucket
			: hasBucket(yesterdayBucket)
				? yesterdayBucket
				: latestBucket;

	const activeTotalTokens = useMemo(() => {
		if (!activeBucket) return 0;
		return Array.from(modelTokensByBucket.get(activeBucket)?.values() ?? []).reduce(
			(sum, value) => sum + value,
			0,
		);
	}, [activeBucket, modelTokensByBucket]);

	const activeModelRows = useMemo(() => {
		if (!activeBucket) return [];
		const modelMap = modelTokensByBucket.get(activeBucket) ?? new Map<string, number>();
		return models
			.map((model) => ({
				id: model.modelId,
				label: model.modelName,
				tokens: modelMap.get(model.modelId) ?? 0,
			}))
			.filter((row) => row.tokens > 0)
			.sort((a, b) => b.tokens - a.tokens)
			.slice(0, 6);
	}, [activeBucket, modelTokensByBucket, models]);

	const activeAppRows = useMemo(() => {
		if (!activeBucket) return [];
		const appMap = appTokensByBucket.get(activeBucket) ?? new Map<string, number>();
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
	}, [activeBucket, appTokensByBucket, apps]);

	return (
		<div className="space-y-4">
			<ChartContainer config={chartConfig} className="h-[360px] w-full">
				<BarChart
					data={chartData}
					margin={{ top: 8, right: 12, left: 0, bottom: 12 }}
					onMouseMove={(state: any) => {
						const bucket =
							typeof state?.activePayload?.[0]?.payload?.bucket === "string"
								? state.activePayload[0].payload.bucket
								: null;
						setHoveredBucket(bucket);
					}}
					onMouseLeave={() => {
						setHoveredBucket(null);
						setHoveredModelId(null);
					}}
				>
					<CartesianGrid vertical={false} className="stroke-muted" />
					<XAxis
						dataKey="label"
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
									const bucket =
										typeof state?.payload?.bucket === "string"
											? state.payload.bucket
											: null;
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
								: "No daily usage data available"}
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
																className={`truncate font-medium hover:text-primary ${
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
													0 tokens for this day.
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
															className="flex min-w-0 items-center gap-2"
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
															<span className="truncate font-medium text-foreground hover:text-primary">
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
																className="text-xs font-medium text-foreground hover:text-primary"
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
													0 tokens for this day.
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
