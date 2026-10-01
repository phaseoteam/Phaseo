// components/(rankings)/TopModelsRankings.tsx
// Purpose: Main rankings table with filtering
// Why: Shows top models by various metrics with trend indicators
// How: Client component with state for filtering, server data fetching

"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
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
    const t = useTranslations("Catalogue.rankings");
    const locale = useLocale();
	const format = useDisplayFormatters();
    const [data] = useState(initialData);
    const [timeRange] = useState<TimeRange>(initialTimeRange as TimeRange);
    const [metric] = useState<Metric>(initialMetric as Metric);

    if (!data.length) {
        return (
            <RankingsEmptyState
                title={t("noData")}
                description={t("rankingsPrivacyThresholdDescription")}
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
                        <span className="text-xs">+{new Intl.NumberFormat(locale).format(change)}</span>
                    </div>
                );
            case "down":
                return (
                    <div className="flex items-center gap-1 text-red-600">
                        <TrendingDown className="h-4 w-4" />
                        <span className="text-xs">-{new Intl.NumberFormat(locale).format(change)}</span>
                    </div>
                );
            case "new":
                return (
                    <Badge variant="secondary" className="text-xs">
                        <Sparkles className="h-3 w-3 mr-1" />
                        {t("usageChangeNew")}
                    </Badge>
                );
            default:
                return <Minus className="h-4 w-4 text-muted-foreground" />;
        }
    };

    const formatValue = (value: number, metricType: Metric) => {
        const safeValue = Number(value);
        if (!Number.isFinite(safeValue)) return "--";
        if (metricType === "cost") {
			return format.number(safeValue, {
				style: "currency",
				currency: "USD",
				maximumFractionDigits: 2,
				notation: "standard",
			});
		}
		return format.number(safeValue, { maximumFractionDigits: 2 });
    };

    return (
        <div className="space-y-4">
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-16">{t("rankColumn")}</TableHead>
                            <TableHead className="w-20">{t("trendColumn")}</TableHead>
                            <TableHead>{t("modelColumn")}</TableHead>
                            <TableHead>{t("providerColumn")}</TableHead>
                            <TableHead className="text-right">{t("usageRequestsUnit")}</TableHead>
                            <TableHead className="text-right">{t("usageTokensUnit")}</TableHead>
                            <TableHead className="text-right">{t("latencyP50Column")}</TableHead>
                            <TableHead className="text-right">{t("successRateColumn")}</TableHead>
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
                                        {row.model_id || t("unknownModelLabel")}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                        {row.provider || t("unknownProviderLabel")}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {formatValue(row.requests, "requests")}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {formatValue(row.total_tokens, "tokens")}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {Number.isFinite(latency)
                                            ? `${new Intl.NumberFormat(locale).format(Math.round(latency))} ms`
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
                                                ? new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(successRate)
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
