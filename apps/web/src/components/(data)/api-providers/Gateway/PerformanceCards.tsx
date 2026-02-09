import * as React from "react";
import { cn } from "@/lib/utils";
import {
	TrendingUp,
	TrendingDown,
	Minus,
	GaugeCircle,
	Timer,
	Hourglass,
	ShieldCheck,
	ShieldAlert,
	Activity,
} from "lucide-react";
import { getProviderMetrics } from "@/lib/fetchers/api-providers/getProviderMetrics";
import { getProviderRoutingHealth } from "@/lib/fetchers/api-providers/getProviderRoutingHealth";
import {
	LatencyChart,
	ThroughputChart,
	E2ELatencyChart,
} from "./PerformanceCharts";
type Trend = "up" | "down" | "neutral";

export function DeltaPill({
	value,
	trend,
	invertColors = false,
	className,
}: {
	value: string;
	trend: Trend;
	invertColors?: boolean;
	className?: string;
}) {
	const isPositive = trend === "up";
	const isNeutral = trend === "neutral";
	const isGood = invertColors ? !isPositive : isPositive;

	let styles: string;
	let Icon: React.ComponentType<any>;

	if (isNeutral) {
		styles =
			"bg-gray-50 text-gray-700 dark:bg-gray-500/10 dark:text-gray-200";
		Icon = Minus;
	} else {
		styles = isGood
			? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200"
			: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200";
		Icon = trend === "down" ? TrendingDown : TrendingUp;
	}

	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
				"ring-1 ring-inset ring-black/5 dark:ring-white/5",
				styles,
				className
			)}
			aria-label={`Change ${value}`}
		>
			<Icon className="h-3.5 w-3.5" aria-hidden />
			{value}
		</span>
	);
}

const ACCENTS = {
	cyan: {
		border: "border-b-cyan-400 dark:border-b-cyan-700",
		icon: "bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-200",
	},
	orange: {
		border: "border-b-amber-400 dark:border-b-amber-700",
		icon: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-100",
	},
	violet: {
		border: "border-b-violet-400 dark:border-b-violet-700",
		icon: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-200",
	},
} as const;

type AccentKey = keyof typeof ACCENTS;

function PerformanceCard({
	title,
	value,
	delta,
	trend,
	icon: Icon,
	accent = "cyan",
	invertDeltaColors = false,
	children,
}: {
	title: string;
	value: string;
	delta?: string;
	trend?: Trend | undefined;
	icon: React.ComponentType<any>;
	accent?: AccentKey;
	invertDeltaColors?: boolean;
	children: React.ReactNode;
}) {
	const isEmpty = value.trim() === "--" || value.trim() === "-";
	const displayValue = isEmpty ? "-" : value;
	const accentConfig = ACCENTS[accent];

	return (
		<div
			className={cn(
				"relative rounded-lg border border-gray-200 dark:border-gray-700 border-b-2 p-5 space-y-4",
				accentConfig.border
			)}
		>
			<div className="flex items-start justify-between gap-4">
				<div className="space-y-3">
					<div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
						{title}
					</div>
					<div className="flex items-center gap-3">
						<span className="text-3xl font-semibold tracking-tight leading-none text-foreground">
							{displayValue}
						</span>
						{!isEmpty && delta && (
							<DeltaPill
								value={delta}
								trend={trend ?? "neutral"}
								invertColors={invertDeltaColors}
							/>
						)}
					</div>
				</div>

				<div
					className={cn(
						"inline-grid h-10 w-10 place-items-center rounded-lg",
						"ring-1 ring-inset ring-black/5 dark:ring-white/5",
						accentConfig.icon
					)}
					aria-hidden
				>
					<Icon className="h-5 w-5" />
				</div>
			</div>

			{/* Chart section */}
			<div className="pt-2">{children}</div>
		</div>
	);
}

export default async function PerformanceCards({
	params,
}: {
	params?: Promise<{ apiProvider: string }> | { apiProvider: string };
}) {
	const resolvedParams = params ? await params : undefined;
	const apiProvider = resolvedParams?.apiProvider;

	// Request last 7 days (24 hours * 7)
	const [metrics, routingHealth] = await Promise.all([
		getProviderMetrics(apiProvider || "", 24 * 7),
		apiProvider
			? getProviderRoutingHealth(apiProvider, { windowHours: 24, maxPairs: 24 })
			: Promise.resolve(null),
	]);

	const throughputData = metrics.timeseries.throughput; // Last 7 days
	const latencyData = metrics.timeseries.latency; // Last 7 days
	const e2eLatencyData = metrics.timeseries.latency.map((point) => ({
		timestamp: point.timestamp,
		avgGenerationMs: point.avgGenerationMs,
	})); // Last 7 days

	// Calculate deltas comparing last day to previous day
	const calculateDelta = (
		data: Array<{
			avgThroughput?: number | null;
			avgLatencyMs?: number | null;
			avgGenerationMs?: number | null;
		}>,
		key: "avgThroughput" | "avgLatencyMs" | "avgGenerationMs"
	) => {
		if (data.length < 2)
			return { value: "+0.0%", trend: "neutral" as Trend };
		const last = data[data.length - 1][key];
		const prev = data[data.length - 2][key];
		if (last == null || prev == null || prev === 0)
			return { value: "+0.0%", trend: "neutral" as Trend };
		const delta = ((last - prev) / prev) * 100;
		return {
			value: (delta >= 0 ? "+" : "") + delta.toFixed(1) + "%",
			trend: delta > 0 ? "up" : delta < 0 ? "down" : ("neutral" as Trend),
		};
	};

	const throughputDelta = calculateDelta(throughputData, "avgThroughput");
	const latencyDelta = calculateDelta(latencyData, "avgLatencyMs");
	const e2eDelta = calculateDelta(e2eLatencyData, "avgGenerationMs");

	const sample = {
		throughput: {
			value:
				metrics.summary.avgThroughput != null
					? `${metrics.summary.avgThroughput.toFixed(2)} t/s`
					: "-",
			delta: throughputDelta.value,
			trend: throughputDelta.trend,
			title: "Throughput (Median tokens/sec)",
		},
		latency: {
			value:
				metrics.summary.avgLatencyMs != null
					? `${Math.round(metrics.summary.avgLatencyMs)} ms`
					: "-",
			delta: latencyDelta.value,
			trend: latencyDelta.trend,
			title: "Latency (Median response time)",
		},
		e2e: {
			value:
				metrics.summary.avgGenerationMs != null
					? `${Math.round(metrics.summary.avgGenerationMs)} ms`
					: "-",
			delta: e2eDelta.value,
			trend: e2eDelta.trend,
			title: "E2E Latency (Median round trip)",
		},
	};
	const healthNowMs = routingHealth?.now_ms ?? 0;

	const openPairs =
		routingHealth?.pairs
			.filter(
				(entry) =>
					entry.breaker === "open" &&
					(entry.breaker_until_ms ?? 0) > healthNowMs,
			)
			.sort((a, b) => a.seconds_until_reopen - b.seconds_until_reopen)
			.slice(0, 3) ?? [];

	const statusBadge = (() => {
		if (!routingHealth) {
			return null;
		}
		if (routingHealth.deranked) {
			return {
				label: "Deranked",
				description:
					"At least one recent model/endpoint tuple is currently blocked by an open circuit breaker.",
				className:
					"border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-900/20 dark:text-red-200",
				icon: ShieldAlert,
			};
		}
		if (routingHealth.recovering) {
			return {
				label: "Recovering",
				description:
					"Circuit breaker is half-open on at least one tuple and currently in probe mode.",
				className:
					"border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-200",
				icon: Activity,
			};
		}
		if (routingHealth.checked_pairs > 0) {
			return {
				label: "Healthy",
				description:
					"No open breakers found across recently active model/endpoint tuples for this provider.",
				className:
					"border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-900/20 dark:text-emerald-200",
				icon: ShieldCheck,
			};
		}
		return {
			label: "No Recent Health Data",
			description:
				"No recent request tuples were found for this provider in the selected health window.",
			className:
				"border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/20 dark:text-slate-200",
			icon: Activity,
		};
	})();

	return (
		<div className="space-y-4">
			{statusBadge && (
				<div
					className={cn(
						"rounded-lg border p-4",
						statusBadge.className,
					)}
				>
					<div className="flex items-center justify-between gap-3">
						<div className="flex items-center gap-2 text-sm font-semibold">
							<statusBadge.icon className="h-4 w-4" />
							Gateway Routing Status
						</div>
						<div className="text-xs font-semibold uppercase tracking-wide">
							{statusBadge.label}
						</div>
					</div>
					<p className="mt-2 text-xs opacity-90">{statusBadge.description}</p>
					{openPairs.length > 0 && (
						<div className="mt-3 space-y-1 text-xs">
							{openPairs.map((entry) => (
								<div
									key={`${entry.endpoint}:${entry.model}`}
									className="font-mono opacity-90"
								>
									{entry.endpoint} {entry.model} {entry.seconds_until_reopen}s
								</div>
							))}
						</div>
					)}
				</div>
			)}

			<div className="grid gap-6 sm:grid-cols-1 md:grid-cols-3 *:min-w-0">
				<PerformanceCard
					title={sample.throughput.title}
					value={sample.throughput.value}
					delta={sample.throughput.delta}
					trend={sample.throughput.trend}
					icon={GaugeCircle}
					accent="cyan"
				>
					<ThroughputChart data={throughputData} />
				</PerformanceCard>

				<PerformanceCard
					title={sample.latency.title}
					value={sample.latency.value}
					delta={sample.latency.delta}
					trend={sample.latency.trend}
					icon={Timer}
					accent="orange"
					invertDeltaColors={true}
				>
					<LatencyChart data={latencyData} />
				</PerformanceCard>

				<PerformanceCard
					title={sample.e2e.title}
					value={sample.e2e.value}
					delta={sample.e2e.delta}
					trend={sample.e2e.trend}
					icon={Hourglass}
					accent="violet"
					invertDeltaColors={true}
				>
					<E2ELatencyChart data={e2eLatencyData} />
				</PerformanceCard>
			</div>
		</div>
	);
}
