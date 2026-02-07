// components/(rankings)/PerformanceScatter.tsx
// Purpose: Scatter chart showing cost vs performance trade-offs
// Why: Helps users visualize model efficiency
// How: Uses Recharts ScatterChart with cost and latency/throughput axes

"use client";

import Link from "next/link";
import {
    ScatterChart,
    Scatter,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ZAxis,
} from "recharts";
import { Logo } from "@/components/Logo";
import type { PerformanceData } from "@/lib/fetchers/rankings/getRankingsData";
import { RankingsEmptyState } from "@/components/(rankings)/RankingsEmptyState";
import { getModelDetailsHref } from "@/lib/models/modelHref";

export type PerformanceMode = "throughput" | "latency";

type PerformanceScatterRow = PerformanceData & {
    model_name?: string | null;
    organisation_id?: string | null;
    provider_name?: string | null;
};

interface PerformanceScatterProps {
    data: PerformanceScatterRow[];
    mode?: PerformanceMode;
}

function formatCompact(value: number) {
    if (!Number.isFinite(value)) return "--";
    if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
    return value.toLocaleString();
}

export function PerformanceScatter({
    data,
    mode = "throughput",
}: PerformanceScatterProps) {
    if (!data.length) {
        return (
            <RankingsEmptyState
                title="No performance data yet"
                description="Performance metrics appear once enough requests are aggregated for a model."
            />
        );
    }

    const chartData = data
        .map((row) => {
            const cost = Number(row.cost_per_1m_tokens);
            const latency = Number(row.median_latency_ms);
            const throughput = Number(row.median_throughput);
            const requests = Number(row.requests);
            const modelName = row.model_name?.trim() || row.model_id || "Unknown model";
            const providerName =
                row.provider_name?.trim() || row.provider || "Unknown provider";

            const yValue = mode === "throughput" ? throughput : latency;

            if (
                !Number.isFinite(cost) ||
                !Number.isFinite(yValue) ||
                !Number.isFinite(requests)
            ) {
                return null;
            }

            return {
                x: cost,
                y: yValue,
                z: requests,
                modelId: row.model_id || "",
                modelName,
                organisationId: row.organisation_id || null,
                providerName,
                providerId: row.provider || "unknown",
                requests,
                cost,
                latency,
                throughput,
            };
        })
        .filter(Boolean) as Array<{
            x: number;
            y: number;
            z: number;
            modelId: string;
            modelName: string;
            organisationId: string | null;
            providerName: string;
            providerId: string;
            requests: number;
            cost: number;
            latency: number;
            throughput: number;
        }>;

    if (!chartData.length) {
        return (
            <RankingsEmptyState
                title="No performance data yet"
                description="Performance metrics appear once enough requests are aggregated for a model."
            />
        );
    }

    return (
        <div className="h-[500px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 60, left: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                    <XAxis
                        type="number"
                        dataKey="x"
                        name="Cost per 1M tokens"
                        label={{
                            value: "Cost per 1M Tokens ($)",
                            position: "bottom",
                            offset: 40,
                        }}
                        domain={[0, "auto"]}
                        axisLine={false}
                        tickLine={false}
                    />
                    <YAxis
                        type="number"
                        dataKey="y"
                        name={mode === "throughput" ? "Throughput" : "Latency"}
                        label={{
                            value:
                                mode === "throughput"
                                    ? "Throughput (tokens/s)"
                                    : "Latency P50 (ms)",
                            angle: -90,
                            position: "left",
                            offset: 40,
                        }}
                        domain={[0, "auto"]}
                        axisLine={false}
                        tickLine={false}
                    />
                    <ZAxis type="number" dataKey="z" range={[50, 1000]} />
                    <Tooltip
                        cursor={false}
                        content={({ payload }) => {
                            if (!payload?.[0]) return null;
                            const point = payload[0].payload;
                            const modelHref = getModelDetailsHref(
                                point.organisationId,
                                point.modelId
                            );
                            const providerHref =
                                point.providerId && point.providerId !== "unknown"
                                    ? `/api-providers/${encodeURIComponent(point.providerId)}`
                                    : null;
                            return (
                                <div className="min-w-[260px] rounded-lg border border-border/60 bg-background/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/90">
                                    <div className="flex items-center gap-2 pb-2">
                                        {providerHref ? (
                                            <Link
                                                href={providerHref}
                                                className="h-8 w-8 rounded-lg border border-border/60 flex items-center justify-center"
                                                aria-label={point.providerName}
                                            >
                                                <div className="relative h-4 w-4">
                                                    <Logo
                                                        id={point.providerId}
                                                        alt={point.providerName}
                                                        className="object-contain"
                                                        fill
                                                    />
                                                </div>
                                            </Link>
                                        ) : (
                                            <div className="h-8 w-8 rounded-lg border border-border/60 flex items-center justify-center">
                                                <div className="relative h-4 w-4">
                                                    <Logo
                                                        id={point.providerId}
                                                        alt={point.providerName}
                                                        className="object-contain"
                                                        fill
                                                    />
                                                </div>
                                            </div>
                                        )}
                                        <div className="min-w-0">
                                            {modelHref ? (
                                                <Link href={modelHref} className="truncate text-sm font-medium block">
                                                    {point.modelName}
                                                </Link>
                                            ) : (
                                                <p className="truncate text-sm font-medium">
                                                    {point.modelName}
                                                </p>
                                            )}
                                            {providerHref ? (
                                                <Link href={providerHref} className="truncate text-xs text-muted-foreground block">
                                                    {point.providerName}
                                                </Link>
                                            ) : (
                                                <p className="truncate text-xs text-muted-foreground">
                                                    {point.providerName}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 border-t border-border/60 pt-2 text-xs">
                                        <span className="text-muted-foreground">Cost</span>
                                        <span className="text-right font-mono">
                                            ${point.cost.toFixed(2)}/1M
                                        </span>
                                        <span className="text-muted-foreground">
                                            {mode === "throughput" ? "Throughput" : "Latency"}
                                        </span>
                                        <span className="text-right font-mono">
                                            {mode === "throughput"
                                                ? `${point.throughput.toFixed(1)} tok/s`
                                                : `${Math.round(point.latency)}ms`}
                                        </span>
                                        <span className="text-muted-foreground">Requests</span>
                                        <span className="text-right font-mono">
                                            {formatCompact(point.requests)}
                                        </span>
                                    </div>
                                </div>
                            );
                        }}
                    />
                    <Scatter data={chartData} fill="hsl(var(--primary))" fillOpacity={0.6} />
                </ScatterChart>
            </ResponsiveContainer>
        </div>
    );
}
