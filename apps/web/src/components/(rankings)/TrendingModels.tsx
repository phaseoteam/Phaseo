// components/(rankings)/TrendingModels.tsx
// Purpose: Display trending models with momentum indicators
// Why: Shows models gaining traction (accelerating growth)
// How: Server component rendering list of trending models

import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { TrendingModel } from "@/lib/fetchers/rankings/getRankingsData";

interface TrendingModelsProps {
    data: TrendingModel[];
}

export function TrendingModels({ data }: TrendingModelsProps) {
    const formatRequests = (num: number) => {
        if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
        if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
        return num.toString();
    };

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
                const growth = model.current_week_requests - model.previous_week_requests;
                const growthPercent =
                    model.previous_week_requests > 0
                        ? ((growth / model.previous_week_requests) * 100).toFixed(0)
                        : "∞";

                return (
                    <Card key={`${model.model_id}-${model.provider}`} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="font-semibold">{model.model_id}</span>
                                        {getMomentumBadge(model.momentum_score, idx)}
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        {model.provider}
                                    </p>
                                    <div className="flex items-center gap-3 mt-2 text-xs">
                                        <span className="text-green-600 font-medium">
                                            +{growthPercent}% this week
                                        </span>
                                        <span className="text-muted-foreground">
                                            {formatRequests(model.current_week_requests)} requests
                                        </span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm font-mono text-muted-foreground">
                                        Velocity: {model.velocity.toFixed(0)}
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
