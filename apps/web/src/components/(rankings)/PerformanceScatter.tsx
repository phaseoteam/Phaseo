// components/(rankings)/PerformanceScatter.tsx
// Purpose: Scatter chart showing cost vs performance trade-offs
// Why: Helps users visualize model efficiency
// How: Uses Recharts ScatterChart with cost and latency/throughput axes

"use client";

import { useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { PerformanceData } from "@/lib/fetchers/rankings/getRankingsData";

interface PerformanceScatterProps {
    data: PerformanceData[];
}

type Mode = "throughput" | "latency";

export function PerformanceScatter({ data }: PerformanceScatterProps) {
    const [mode, setMode] = useState<Mode>("throughput");

    const chartData = data.map((row) => ({
        x: row.cost_per_1m_tokens,
        y: mode === "throughput" ? row.median_throughput : row.median_latency_ms,
        z: row.requests, // Bubble size
        model: row.model_id,
        provider: row.provider,
        successRate: row.success_rate,
        requests: row.requests,
        cost: row.cost_per_1m_tokens,
        latency: row.median_latency_ms,
        throughput: row.median_throughput,
    }));

    return (
        <div className="space-y-4">
            {/* Mode Toggle */}
            <div className="flex gap-2">
                <Button
                    variant={mode === "throughput" ? "default" : "outline"}
                    onClick={() => setMode("throughput")}
                >
                    Throughput View
                </Button>
                <Button
                    variant={mode === "latency" ? "default" : "outline"}
                    onClick={() => setMode("latency")}
                >
                    Latency View
                </Button>
            </div>

            {/* Scatter Chart */}
            <Card className="p-4">
                <ResponsiveContainer width="100%" height={500}>
                    <ScatterChart margin={{ top: 20, right: 20, bottom: 60, left: 60 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
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
                <p className="text-sm text-muted-foreground text-center mt-4">
                    Bubble size represents request volume (last 24 hours). Lower cost + {mode === "throughput" ? "higher throughput" : "lower latency"} = better value.
                </p>
            </Card>
        </div>
    );
}
