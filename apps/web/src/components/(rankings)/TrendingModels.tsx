"use client";

// components/(rankings)/TrendingModels.tsx
// Purpose: Display trending models with momentum indicators
// Why: Shows models gaining traction (accelerating growth)
// How: Server component rendering list of trending models

import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { TrendingModel } from "@/lib/fetchers/rankings/getRankingsData";
import { RankingsEmptyState } from "@/components/(rankings)/RankingsEmptyState";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";

interface TrendingModelsProps {
    data: TrendingModel[];
}

export function TrendingModels({ data }: TrendingModelsProps) {
	const format = useDisplayFormatters();
    if (!data.length) {
        return (
            <RankingsEmptyState
                title="No trending data yet"
                description="Trending models appear once weekly usage clears privacy thresholds."
            />
        );
    }

    const formatRequests = (num: number) => format.number(num, {
        notation: num >= 1_000 ? "compact" : "standard",
        maximumFractionDigits: 1,
    });

    const getMomentumBadge = (score: number, idx: number) => {
        if (idx === 0) {
            return (
                <Badge variant="destructive" className="gap-1">
                    <Flame className="h-3 w-3" />
                    Hot
                </Badge>
            );
        }
        if (idx < 5) {
            return (
                <Badge variant="default" className="gap-1">
                    <TrendingUp className="h-3 w-3" />
                    Rising
                </Badge>
            );
        }
        return (
            <Badge variant="secondary" className="gap-1">
                <TrendingUp className="h-3 w-3" />
                Trending
            </Badge>
        );
    };

    return (
        <div className="space-y-3">
            {data.slice(0, 10).map((model, idx) => {
                const currentWeek = Number(model.current_week_requests ?? 0);
                const previousWeek = Number(model.previous_week_requests ?? 0);
                const growth = currentWeek - previousWeek;
                const growthPercent =
                    previousWeek > 0
                        ? format.number((growth / previousWeek) * 100, {
                            maximumFractionDigits: 0,
                        })
                        : "inf";

                return (
                    <Card key={`${model.model_id}-${model.provider}`} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="font-semibold">{model.model_id}</span>
                                        {getMomentumBadge(Number(model.momentum_score ?? 0), idx)}
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        {model.provider}
                                    </p>
                                    <div className="flex items-center gap-3 mt-2 text-xs">
                                        <span className="text-green-600 font-medium">
                                            +{growthPercent}% this week
                                        </span>
                                        <span className="text-muted-foreground">
                                            {formatRequests(currentWeek)} requests
                                        </span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm tabular-nums text-muted-foreground">
                                        Velocity: {format.number(Number(model.velocity ?? 0), {
                                            maximumFractionDigits: 0,
                                        })}
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}
