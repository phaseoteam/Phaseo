// components/(rankings)/TopModelsRankings.tsx
// Purpose: Main rankings table with filtering
// Why: Shows top models by various metrics with trend indicators
// How: Client component with state for filtering, server data fetching

"use client";

import { useState } from "react";
import { TrendingUp, TrendingDown, Minus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { RankingModel } from "@/lib/fetchers/rankings/getRankingsData";
import { RankingsEmptyState } from "@/components/(rankings)/RankingsEmptyState";

interface TopModelsRankingsProps {
    initialData: RankingModel[];
    initialTimeRange?: string;
    initialMetric?: string;
}

type TimeRange = "today" | "week" | "month" | "all";
type Metric = "tokens" | "requests" | "cost";

export function TopModelsRankings({
    initialData,
    initialTimeRange = "week",
    initialMetric = "tokens",
}: TopModelsRankingsProps) {
    const [data] = useState(initialData);
    const [timeRange] = useState<TimeRange>(initialTimeRange as TimeRange);
    const [metric] = useState<Metric>(initialMetric as Metric);

    if (!data.length) {
        return (
            <RankingsEmptyState
                title="No rankings data yet"
                description="Rankings appear once enough requests are aggregated to meet privacy thresholds."
            />
        );
    }

    const getTrendIcon = (trend: string, rankChange: number) => {
        const change = Math.abs(rankChange);
        switch (trend) {
            case "up":
                return (
                    <div className="flex items-center gap-1 text-green-600">
                        <TrendingUp className="h-4 w-4" />
                        <span className="text-xs">+{change}</span>
                    </div>
                );
            case "down":
                return (
                    <div className="flex items-center gap-1 text-red-600">
                        <TrendingDown className="h-4 w-4" />
                        <span className="text-xs">-{change}</span>
                    </div>
                );
            case "new":
                return (
                    <Badge variant="secondary" className="text-xs">
                        <Sparkles className="h-3 w-3 mr-1" />
                        New
                    </Badge>
                );
            default:
                return <Minus className="h-4 w-4 text-muted-foreground" />;
        }
    };

    const formatValue = (value: number, metricType: Metric) => {
        const safeValue = Number(value);
        if (!Number.isFinite(safeValue)) return "--";
        if (metricType === "tokens") {
            return safeValue >= 1e9
                ? `${(safeValue / 1e9).toFixed(2)}B`
                : safeValue >= 1e6
                ? `${(safeValue / 1e6).toFixed(2)}M`
                : safeValue >= 1e3
                ? `${(safeValue / 1e3).toFixed(2)}K`
                : safeValue.toString();
        }
        if (metricType === "cost") return `$${safeValue.toFixed(2)}`;
        return safeValue.toLocaleString();
    };

    return (
        <div className="space-y-4">
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-16">Rank</TableHead>
                            <TableHead className="w-20">Trend</TableHead>
                            <TableHead>Model</TableHead>
                            <TableHead>Provider</TableHead>
                            <TableHead className="text-right">Requests</TableHead>
                            <TableHead className="text-right">Tokens</TableHead>
                            <TableHead className="text-right">Latency (P50)</TableHead>
                            <TableHead className="text-right">Success Rate</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.map((row) => {
                            const rank = Number(row.rank ?? 0);
                            const prevRank = Number(row.prev_rank ?? row.rank ?? 0);
                            const rankChange = prevRank - rank;
                            const latency = Number(row.median_latency_ms);
                            const successRate = Number(row.success_rate);
                            return (
                                <TableRow key={`${row.model_id}-${row.provider}`}>
                                    <TableCell className="font-medium">#{rank}</TableCell>
                                    <TableCell>
                                        {getTrendIcon(row.trend ?? "same", rankChange)}
                                    </TableCell>
                                    <TableCell className="font-semibold">
                                        {row.model_id || "Unknown"}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                        {row.provider || "Unknown"}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {formatValue(row.requests, "requests")}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {formatValue(row.total_tokens, "tokens")}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {Number.isFinite(latency)
                                            ? `${Math.round(latency)}ms`
                                            : "--"}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <span
                                            className={
                                                Number.isFinite(successRate) &&
                                                successRate >= 0.99
                                                    ? "text-green-600"
                                                    : Number.isFinite(successRate) &&
                                                      successRate >= 0.95
                                                    ? "text-yellow-600"
                                                    : "text-red-600"
                                            }
                                        >
                                            {Number.isFinite(successRate)
                                                ? `${(successRate * 100).toFixed(1)}%`
                                                : "--"}
                                        </span>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
