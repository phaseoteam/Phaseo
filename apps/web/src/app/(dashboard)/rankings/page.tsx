// app/(dashboard)/rankings/page.tsx
// Purpose: Public rankings page showing AI model usage statistics
// Why: Provides transparency and insights into model usage across the gateway
// How: Server component that fetches data and renders visualizations

import { Suspense } from "react";
import { Metadata } from "next";
import { RankingsHeader } from "@/components/(rankings)/RankingsHeader";
import { SummaryStats } from "@/components/(rankings)/SummaryStats";
import { TopModelsRankings } from "@/components/(rankings)/TopModelsRankings";
import { PerformanceScatter } from "@/components/(rankings)/PerformanceScatter";
import { MarketShareVisualizations } from "@/components/(rankings)/MarketShareVisualizations";
import { TrendingModels } from "@/components/(rankings)/TrendingModels";
import {
    StatsSkeleton,
    TableSkeleton,
    ChartSkeleton,
    ListSkeleton,
} from "@/components/(rankings)/Skeletons";
import {
    getRankings,
    getPerformanceData,
    getMarketShare,
} from "@/lib/fetchers/rankings/getRankingsData";

export const metadata: Metadata = {
    title: "AI Model Rankings - Usage Statistics & Performance | AI Stats",
    description:
        "Real-time rankings of AI models by usage, performance, and reliability. Compare costs, latency, and throughput across providers using data from AI Stats Gateway.",
    keywords: [
        "AI rankings",
        "model usage",
        "AI statistics",
        "model performance",
        "LLM rankings",
        "AI model comparison",
        "model costs",
        "model latency",
    ],
    alternates: { canonical: "/rankings" },
    openGraph: {
        title: "AI Model Rankings - Live Usage Statistics",
        description:
            "Compare AI models by usage, cost, and performance. Real-time data from AI Stats Gateway.",
        type: "website",
    },
};

export default async function RankingsPage() {
    return (
        <div className="container mx-auto py-8 space-y-8">
            <RankingsHeader />

            {/* Hero Stats */}
            <Suspense fallback={<StatsSkeleton />}>
                <SummaryStats />
            </Suspense>

            {/* Top Models Rankings Table */}
            <section className="space-y-4">
                <div>
                    <h2 className="text-2xl font-bold">Top Models</h2>
                    <p className="text-muted-foreground">
                        Most used models this week, ranked by total tokens processed
                    </p>
                </div>
                <Suspense fallback={<TableSkeleton />}>
                    <TopModelsRankingsServer />
                </Suspense>
            </section>

            {/* Performance Scatter */}
            <section className="space-y-4">
                <div>
                    <h2 className="text-2xl font-bold">Performance Landscape</h2>
                    <p className="text-muted-foreground">
                        Cost vs. Performance trade-offs (last 24 hours)
                    </p>
                </div>
                <Suspense fallback={<ChartSkeleton />}>
                    <PerformanceScatterServer />
                </Suspense>
            </section>

            {/* Market Share */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                    <div>
                        <h3 className="text-xl font-semibold">Market Share by Organization</h3>
                        <p className="text-sm text-muted-foreground">
                            Model creators ranked by usage
                        </p>
                    </div>
                    <Suspense fallback={<ChartSkeleton />}>
                        <MarketShareOrganizationServer />
                    </Suspense>
                </div>
                <div className="space-y-4">
                    <div>
                        <h3 className="text-xl font-semibold">Market Share by Provider</h3>
                        <p className="text-sm text-muted-foreground">
                            API providers ranked by usage
                        </p>
                    </div>
                    <Suspense fallback={<ChartSkeleton />}>
                        <MarketShareProviderServer />
                    </Suspense>
                </div>
            </section>

            {/* Trending Models */}
            <section className="space-y-4">
                <div>
                    <h3 className="text-xl font-semibold">Trending Models</h3>
                    <p className="text-sm text-muted-foreground">
                        Models with the highest momentum (accelerating growth)
                    </p>
                </div>
                <Suspense fallback={<ListSkeleton />}>
                    <TrendingModelsServer />
                </Suspense>
            </section>

            {/* Footer note */}
            <div className="text-center text-sm text-muted-foreground border-t pt-8">
                <p>
                    All data is aggregated across teams with privacy-preserving thresholds.
                    Updated every 5 minutes.
                </p>
            </div>
        </div>
    );
}

// Server components for data fetching

async function TopModelsRankingsServer() {
    const data = await getRankings("week", "tokens", 50);
    console.log("[TopModelsRankingsServer] Data received:", {
        ok: data.ok,
        rankingsCount: data.rankings.length,
        rankings: data.rankings.slice(0, 3), // Show first 3
    });
    return <TopModelsRankings initialData={data.rankings} />;
}

async function PerformanceScatterServer() {
    const result = await getPerformanceData(24);
    console.log("[PerformanceScatterServer] Data received:", {
        count: result.data.length,
        sample: result.data.slice(0, 3),
    });
    return <PerformanceScatter data={result.data} />;
}

async function MarketShareOrganizationServer() {
    const result = await getMarketShare("organization", "week");
    console.log("[MarketShareOrganizationServer] Data received:", {
        count: result.data.length,
        data: result.data,
    });
    return <MarketShareVisualizations data={result.data} dimension="organization" />;
}

async function MarketShareProviderServer() {
    const result = await getMarketShare("provider", "week");
    console.log("[MarketShareProviderServer] Data received:", {
        count: result.data.length,
        data: result.data,
    });
    return <MarketShareVisualizations data={result.data} dimension="provider" />;
}

async function TrendingModelsServer() {
    const data = await getRankings();
    console.log("[TrendingModelsServer] Data received:", {
        trendingCount: data.trending.length,
        trending: data.trending.slice(0, 3),
    });
    return <TrendingModels data={data.trending} />;
}
