// components/(rankings)/SummaryStats.tsx
// Purpose: Display summary statistics for the gateway
// Why: Provides quick overview of activity in last 24h
// How: Fetches and displays summary stats in cards

import { getRankings } from "@/lib/fetchers/rankings/getRankingsData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Zap, Server, Clock, CheckCircle2, Hash } from "lucide-react";

export async function SummaryStats() {
    const data = await getRankings();
    const summary = data.summary;

    console.log("[SummaryStats] Data received:", { summary, ok: data.ok });

    if (!summary) {
        console.warn("[SummaryStats] No summary data available");
        return null;
    }

    const stats = [
        {
            title: "Requests (24h)",
            value: summary.total_requests_24h.toLocaleString(),
            icon: Activity,
            description: "Total requests processed",
        },
        {
            title: "Tokens (24h)",
            value: formatTokens(summary.total_tokens_24h),
            icon: Hash,
            description: "Total tokens processed",
        },
        {
            title: "Models",
            value: summary.total_models.toString(),
            icon: Server,
            description: "Unique models used",
        },
        {
            title: "Providers",
            value: summary.total_providers.toString(),
            icon: Zap,
            description: "Unique providers",
        },
        {
            title: "Avg Latency",
            value: `${Math.round(summary.avg_latency_ms)}ms`,
            icon: Clock,
            description: "Average response time",
        },
        {
            title: "Success Rate",
            value: `${(summary.success_rate_24h * 100).toFixed(1)}%`,
            icon: CheckCircle2,
            description: "Successful requests",
        },
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {stats.map((stat) => {
                const Icon = stat.icon;
                return (
                    <Card key={stat.title}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                            <Icon className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stat.value}</div>
                            <p className="text-xs text-muted-foreground">{stat.description}</p>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}

function formatTokens(tokens: number): string {
    if (tokens >= 1e9) return `${(tokens / 1e9).toFixed(2)}B`;
    if (tokens >= 1e6) return `${(tokens / 1e6).toFixed(2)}M`;
    if (tokens >= 1e3) return `${(tokens / 1e3).toFixed(2)}K`;
    return tokens.toString();
}
