// components/(rankings)/PerformanceScatter.tsx
// Purpose: Scatter chart showing cost vs performance trade-offs
// Why: Helps users visualize model efficiency
// How: Uses Recharts ScatterChart with cost and latency/throughput axes

"use client";

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
import { Card } from "@/components/ui/card";
import type { PerformanceData } from "@/lib/fetchers/rankings/getRankingsData";
import { RankingsEmptyState } from "@/components/(rankings)/RankingsEmptyState";

interface PerformanceScatterProps {
    data: PerformanceData[];
    mode?: Mode;
}

type Mode = "throughput" | "latency";

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
            const successRate = Number(row.success_rate);

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
                model: row.model_id || "Unknown",
                provider: row.provider || "Unknown",
                successRate,
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
            model: string;
            provider: string;
            successRate: number;
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
        <div className="space-y-4">
            {/* Scatter Chart */}
            <div className="space-y-4">
                <ResponsiveContainer width="100%" height={500}>
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
                            content={({ payload }) => {
                                if (!payload?.[0]) return null;
                                const data = payload[0].payload;
                                return (
                                    <Card className="p-3 shadow-lg border">
                                        <div className="space-y-2">
                                            <p className="font-semibold">{data.model}</p>
                                            <p className="text-sm text-muted-foreground">
                                                {data.provider}
                                            </p>
                                            <div className="text-sm space-y-1 pt-2 border-t">
                                                <p>Cost: ${data.cost.toFixed(2)}/1M tokens</p>
                                                <p>
                                                    {mode === "throughput"
                                                        ? `Throughput: ${data.throughput.toFixed(1)} tok/s`
                                                        : `Latency: ${Math.round(data.latency)}ms`}
                                                </p>
                                                <p>Requests: {data.requests.toLocaleString()}</p>
                                                <p>
                                                    Success Rate:{" "}
                                                    {(data.successRate * 100).toFixed(1)}%
                                                </p>
                                            </div>
                                        </div>
                                    </Card>
                                );
                            }}
                        />
                        <Scatter data={chartData} fill="hsl(var(--primary))" fillOpacity={0.6} />
                    </ScatterChart>
                </ResponsiveContainer>
                <p className="text-sm text-muted-foreground text-center">
                    Bubble size represents request volume (last 24 hours). Lower cost + {mode === "throughput" ? "higher throughput" : "lower latency"} = better value.
                </p>
            </div>
        </div>
    );
}
