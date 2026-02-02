"use client";

import { BarChart3, CircuitBoard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import CheckItem from "../page/CheckItem";
import type { GatewayMarketingMetrics } from "@/lib/fetchers/gateway/getMarketingMetrics";

function formatPercent(value: number | null | undefined, digits = 2): string {
	const normalized = value == null || Number.isNaN(value) ? 0 : value;
	return `${normalized.toFixed(digits)}%`;
}

function formatLatency(value: number | null | undefined): string {
	const normalized = value == null || Number.isNaN(value) ? 0 : value;
	return `${Math.round(normalized)} ms`;
}

function formatCompactNumber(value: number | null | undefined): string {
	const normalized = value == null || Number.isNaN(value) ? 0 : value;
	return Intl.NumberFormat("en-US", {
		notation: "compact",
		maximumFractionDigits: 1,
	}).format(normalized);
}

function formatAbsoluteNumber(
	value: number | string | null | undefined
): string {
	if (value == null) return "0";
	const numericValue =
		typeof value === "number" ? value : Number.parseFloat(String(value));
	if (!Number.isFinite(numericValue)) return "0";
	return Intl.NumberFormat("en-US").format(Math.round(numericValue));
}

function formatHourLabel(iso: string): string {
	const date = new Date(iso);
	return date.toLocaleString(undefined, {
		weekday: "short",
		hour: "numeric",
	});
}

function formatHoursAgoTick(value: number | string | null | undefined): string {
	const hours =
		value == null || Number.isNaN(Number(value))
			? null
			: Math.max(0, Math.round(Number(value)));

	if (hours == null) {
		return "";
	}

	return hours === 0 ? "Now" : `${hours}h`;
}

function formatHoursAgoTooltip(
	value: number | string | null | undefined
): string {
	const hours =
		value == null || Number.isNaN(Number(value))
			? null
			: Math.max(0, Math.round(Number(value)));

	if (hours == null) {
		return "";
	}

	return hours === 0 ? "Now" : `${hours}h ago`;
}

function formatTooltipNumber(
	value: number | string | null | undefined,
	unit: string
): string {
	if (value == null) return `0 ${unit}`;
	const numericValue =
		typeof value === "number" ? value : Number.parseFloat(String(value));
	if (!Number.isFinite(numericValue)) {
		return `0 ${unit}`;
	}
	return `${Intl.NumberFormat("en-US", {
		maximumFractionDigits: 1,
	}).format(numericValue)} ${unit}`;
}

interface ReliabilitySectionProps {
	metrics: GatewayMarketingMetrics;
}

export function ReliabilitySection({ metrics }: ReliabilitySectionProps) {
	const throughputData = (() => {
		return metrics.timeseries.throughput.map((point) => {
			const hoursAgo =
				typeof point.hoursAgo === "number" ? point.hoursAgo : 0;
			return {
				...point,
				label: formatHoursAgoTick(hoursAgo),
				requestsPerHour: point.requests,
				tokensPerHour: Math.round(point.tokensPerMin * 60),
				hoursAgo,
			};
		});
	})();

	const tokensSparkline = throughputData.map((point) => ({
		label: point.label,
		tokens: point.tokensPerHour,
	}));

	return (
		<section id="reliability-open" className="py-16">
			<div className="mx-auto max-w-7xl space-y-10 px-6 lg:px-8">
				<div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,500px)]">
					<div className="space-y-4">
						<h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
							Reliability you can trust. Openness you can verify.
						</h2>
						<p className="text-sm text-slate-600 dark:text-slate-400">
							Latency, uptime, and throughput telemetry feed
							directly into routing. Every adapter, health probe,
							and ingestion script lives under an open source
							licence.
						</p>
					</div>
					<Card className="border-slate-200">
						<CardHeader className="space-y-3">
							<CardTitle className="flex items-center gap-2 text-base">
								<CircuitBoard className="h-4 w-4 text-slate-500 dark:text-slate-300" />
								Last 24 hours
							</CardTitle>
							<div className="grid grid-cols-2 gap-4 text-sm text-slate-700 dark:text-slate-300">
								<div className="flex items-center justify-between">
									<span>Uptime</span>
									<span className="font-semibold">
										{formatPercent(
											metrics.summary.uptimePct,
											3
										)}
									</span>
								</div>
								<div className="flex items-center justify-between">
									<span>Median latency</span>
									<span className="font-semibold">
										{formatLatency(
											metrics.summary.latencyP50Ms
										)}
									</span>
								</div>
								<div className="flex items-center justify-between">
									<span>Tokens served</span>
									<span className="font-semibold">
										{formatCompactNumber(
											metrics.summary.tokens24h
										)}
									</span>
								</div>
								<div className="flex items-center justify-between">
									<span>Models supported</span>
									<span className="font-semibold">
										{formatAbsoluteNumber(
											metrics.summary.supportedModels
										)}
									</span>
								</div>
							</div>
						</CardHeader>
					</Card>
				</div>

				<Card className="border-slate-200">
					<CardHeader className="space-y-2">
						<CardTitle className="flex items-center gap-2 text-base">
							<BarChart3 className="h-4 w-4 text-slate-500 dark:text-slate-300" />
							Gateway tokens per hour (24h)
						</CardTitle>
						<p className="text-sm text-slate-600 dark:text-slate-400">
							Healthy token volume and stability driven by
							community contributions and enterprise adoption.
						</p>
					</CardHeader>
					<CardContent>
						<ChartContainer
							config={{
								tokens: {
									label: "Tokens",
									color: "hsl(145 80% 45%)",
								},
							}}
							className="h-[220px] w-full"
						>
							<AreaChart data={tokensSparkline}>
								<defs>
									<linearGradient
										id="sparklineFill"
										x1="0"
										x2="0"
										y1="0"
										y2="1"
									>
										<stop
											offset="5%"
											stopColor="hsl(210 90% 45%)"
											stopOpacity={0.25}
										/>
										<stop
											offset="95%"
											stopColor="hsl(210 90% 45%)"
											stopOpacity={0}
										/>
									</linearGradient>
								</defs>
								<CartesianGrid strokeDasharray="3 3" />
								<XAxis
									dataKey="label"
									tickLine={false}
									axisLine={false}
									interval={0}
								/>
								<YAxis
									tickFormatter={(value) =>
										formatCompactNumber(value)
									}
									width={68}
								/>
								<ChartTooltip
									content={
										<ChartTooltipContent
											className="gap-2.5"
											labelFormatter={(_, payload) =>
												formatHoursAgoTooltip(
													payload?.[0]?.payload
														?.hoursAgo
												)
											}
											formatter={(value) => {
												const resolved = Array.isArray(
													value
												)
													? value[0]
													: value;
												return (
													<div className="flex flex-col gap-0.5">
														<span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
															{formatTooltipNumber(
																resolved,
																"tokens"
															)}
														</span>
														<span className="text-[0.65rem] uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
															per hour
														</span>
													</div>
												);
											}}
										/>
									}
								/>
								<Area
									type="monotone"
									dataKey="tokens"
									stroke="hsl(145 80% 45%)"
									fill="url(#sparklineFill)"
									strokeWidth={2}
									dot={false}
									isAnimationActive={false}
								/>
							</AreaChart>
						</ChartContainer>
					</CardContent>
				</Card>
			</div>
		</section>
	);
}
