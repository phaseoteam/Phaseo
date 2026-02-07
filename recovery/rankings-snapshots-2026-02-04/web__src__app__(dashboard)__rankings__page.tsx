// app/(dashboard)/rankings/page.tsx
// Purpose: Public rankings page showing AI model usage statistics
// Why: Provides transparency and insights into model usage across the gateway
// How: Server component that fetches data and renders visualizations

import { Suspense } from "react";
import { Metadata } from "next";
import { RankingsHeader } from "@/components/(rankings)/RankingsHeader";
import { PerformanceLandscapePanel } from "@/components/(rankings)/PerformanceLandscapePanel";
import { PerformanceLeaderboard } from "@/components/(rankings)/PerformanceLeaderboard";
import { MarketShareStackedBar } from "@/components/(rankings)/MarketShareStackedBar";
import { UsageStackedBar } from "@/components/(rankings)/UsageStackedBar";
import { ModelLeaderboard } from "@/components/(rankings)/ModelLeaderboard";
import { MarketShareLeaderboard } from "@/components/(rankings)/MarketShareLeaderboard";
import { AppsUsageList } from "@/components/(rankings)/AppsUsageList";
import { ChartSkeleton, ListSkeleton } from "@/components/(rankings)/Skeletons";
import {
    Activity,
    AppWindow,
    Building2,
    Network,
    TrendingUp,
} from "lucide-react";
import {
    getRankings,
    getPerformanceData,
    getMarketShareTimeseries,
    getTimeseriesData,
    getModelNamesByIds,
    getProviderNamesByIds,
    getProviderMetaByIds,
    getModelLeaderboardMetaByIds,
    getMarketShare,
    getTopApps,
    getOrganisationLogoIdsByNames,
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
        <div className="container mx-auto py-8 space-y-16">
            <div className="space-y-8">
                <RankingsHeader />

                {/* Leaderboard + Usage */}
                <section className="space-y-3">
                    <div className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-muted-foreground" />
                        <h2 className="text-2xl font-bold">Model Usage Over Time</h2>
                    </div>
                    <Suspense fallback={<ChartSkeleton />}>
                        <UsageStackedBarServer />
                    </Suspense>
                    <Suspense fallback={<ListSkeleton />}>
                        <ModelLeaderboardServer />
                    </Suspense>
                </section>
            </div>

            {/* Performance Scatter */}
            <section className="space-y-4">
                <Suspense fallback={<ChartSkeleton />}>
                    <PerformanceScatterServer />
                </Suspense>
                <Suspense fallback={<ListSkeleton />}>
                    <PerformanceLeaderboardServer />
                </Suspense>
            </section>

            {/* Market Share */}
            <section className="space-y-4">
                <div className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                    <h3 className="text-xl font-semibold">Market Share by Organization</h3>
                </div>
                <Suspense fallback={<ChartSkeleton />}>
                    <MarketShareOrganizationServer />
                </Suspense>
                <Suspense fallback={<ListSkeleton />}>
                    <MarketShareOrganizationLeaderboardServer />
                </Suspense>
            </section>
            <section className="space-y-4">
                <div className="flex items-center gap-2">
                    <Network className="h-5 w-5 text-muted-foreground" />
                    <h3 className="text-xl font-semibold">Market Share by Provider</h3>
                </div>
                <Suspense fallback={<ChartSkeleton />}>
                    <MarketShareProviderServer />
                </Suspense>
                <Suspense fallback={<ListSkeleton />}>
                    <MarketShareProviderLeaderboardServer />
                </Suspense>
            </section>

            {/* Apps */}
            <section className="space-y-4">
                <Suspense fallback={<ListSkeleton />}>
                    <AppsUsageServer />
                </Suspense>
            </section>
        </div>
    );
}

// Server components for data fetching

async function PerformanceScatterServer() {
    const dayRes = await getPerformanceData(24);
    const modelIds = Array.from(
        new Set(dayRes.data.map((row) => row.model_id).filter(Boolean))
    );
    const providerIds = Array.from(
        new Set(dayRes.data.map((row) => row.provider).filter(Boolean))
    );
    const [modelNameMap, providerMetaMap] = await Promise.all([
        getModelNamesByIds(modelIds),
        getProviderMetaByIds(providerIds),
    ]);

    const dataWithMeta = dayRes.data.map((row) => ({
        ...row,
        model_name: modelNameMap[row.model_id] ?? row.model_id,
        provider_name: providerMetaMap[row.provider]?.name ?? row.provider,
        provider_colour: providerMetaMap[row.provider]?.colour ?? null,
    }));
    console.log("[PerformanceScatterServer] Data received:", {
        dayCount: dayRes.data.length,
    });
    return (
        <PerformanceLandscapePanel
            data={dataWithMeta}
            defaultMode="throughput"
            showHeader
            title="Performance Landscape"
            icon={<Activity className="h-5 w-5" />}
        />
    );
}

async function MarketShareOrganizationServer() {
    const result = await getMarketShareTimeseries("organization", "year", "week", 8);
    console.log("[MarketShareOrganizationServer] Data received:", {
        count: result.data.length,
        sample: result.data.slice(0, 3),
    });
    return (
        <MarketShareStackedBar
            data={result.data}
            dimension="organization"
            metric="tokens"
            normalizeToPercent
        />
    );
}

async function MarketShareProviderServer() {
    const result = await getMarketShareTimeseries("provider", "year", "week", 8);
    console.log("[MarketShareProviderServer] Data received:", {
        count: result.data.length,
        sample: result.data.slice(0, 3),
    });
    const providerIds = Array.from(
        new Set(
            result.data
                .map((row) => row.name)
                .filter(
                    (id) =>
                        id &&
                        id.toLowerCase() !== "other" &&
                        id.toLowerCase() !== "unknown"
                )
        )
    );
    const providerNameMap = await getProviderNamesByIds(providerIds);
    const dataWithNames = result.data.map((row) => ({
        ...row,
        name: providerNameMap[row.name] ?? row.name,
    }));
    return (
        <MarketShareStackedBar
            data={dataWithNames}
            dimension="provider"
            metric="tokens"
            normalizeToPercent
        />
    );
}

async function UsageStackedBarServer() {
    const result = await getTimeseriesData("year", "week", 8);
    console.log("[UsageStackedBarServer] Data received:", {
        count: result.data.length,
        sample: result.data.slice(0, 3),
    });
    const modelIds = Array.from(
        new Set(
            result.data
                .map((row) => row.model_id)
                .filter((id) => id && id.toLowerCase() !== "other" && id.toLowerCase() !== "unknown")
        )
    );
    const nameMap = await getModelNamesByIds(modelIds);
    return <UsageStackedBar data={result.data} metric="tokens" nameMap={nameMap} />;
}

async function ModelLeaderboardServer() {
    const [weekRes, todayRes, monthRes] = await Promise.all([
        getRankings("week", "tokens", 200),
        getRankings("today", "tokens", 50),
        getRankings("month", "tokens", 50),
    ]);

    const filterRankings = (rows: typeof weekRes.rankings) =>
        rows.filter(
            (row) =>
                row.model_id &&
                row.model_id.toLowerCase() !== "unknown" &&
                row.model_id.toLowerCase() !== "other" &&
                Number(row.total_tokens ?? 0) > 0
        );

    const weekRankings = filterRankings(weekRes.rankings);
    const todayRankings = filterRankings(todayRes.rankings);
    const monthRankings = filterRankings(monthRes.rankings);

    const allModelIds = Array.from(
        new Set(
            [...weekRankings, ...todayRankings, ...monthRankings]
                .map((row: any) => row.model_id)
                .filter((id) => id)
        )
    );

    const metaMap = await getModelLeaderboardMetaByIds(allModelIds);
    const weekKeyed = new Map(
        weekRankings.map((row) => [
            `${row.model_id}:${row.provider ?? ""}`,
            row,
        ])
    );

    const buildEntries = (rows: typeof weekRes.rankings) =>
        rows.map((row) => {
            const meta = metaMap[row.model_id] ?? null;
            return {
                key: `${row.model_id}:${row.provider ?? ""}`,
                model_id: row.model_id,
                model_name: meta?.name ?? row.model_id,
                provider_id: row.provider ?? null,
                organisation_id: meta?.organisation_id ?? null,
                organisation_name: meta?.organisation_name ?? null,
                organisation_colour: meta?.organisation_colour ?? null,
                tokens: Number(row.total_tokens ?? 0),
                prev_tokens: Number(row.prev_total_tokens ?? 0),
                rank: Number(row.rank ?? 0),
                prev_rank: Number(row.prev_rank ?? 0),
                trend: row.trend ?? "same",
            };
        });

    const trendingEntries = buildEntries(weekRankings)
        .map((entry) => {
            const prevTokens = Number(entry.prev_tokens ?? 0);
            if (!Number.isFinite(prevTokens) || prevTokens <= 0) {
                return {
                    ...entry,
                    trend: "new" as const,
                    change_value: null,
                };
            }
            const change = ((entry.tokens - prevTokens) / prevTokens) * 100;
            return {
                ...entry,
                trend: change > 0 ? "up" : change < 0 ? "down" : "same",
                change_value: change,
                change_label: "%",
            };
        })
        .sort((a, b) => {
            const aNew = a.trend === "new";
            const bNew = b.trend === "new";
            if (aNew !== bNew) return aNew ? -1 : 1;
            const aChange = Number(a.change_value ?? 0);
            const bChange = Number(b.change_value ?? 0);
            return bChange - aChange;
        });

    return (
        <ModelLeaderboard
            dataByRange={{
                week: buildEntries(weekRankings),
                today: buildEntries(todayRankings),
                month: buildEntries(monthRankings),
                trending: trendingEntries,
            }}
            defaultRange="week"
            showRangeControls
            showHeader
            title="Leaderboard"
        />
    );
}

async function PerformanceLeaderboardServer() {
    const perfRes = await getPerformanceData(24);
    const filtered = perfRes.data.filter((row) => {
        const throughput = Number(row.median_throughput ?? 0);
        return (
            row.model_id &&
            row.provider &&
            Number.isFinite(throughput) &&
            throughput > 0
        );
    });
    const modelIds = Array.from(
        new Set(filtered.map((row) => row.model_id).filter(Boolean))
    );
    const providerIds = Array.from(
        new Set(filtered.map((row) => row.provider).filter(Boolean))
    );
    const [modelNameMap, providerMetaMap] = await Promise.all([
        getModelNamesByIds(modelIds),
        getProviderMetaByIds(providerIds),
    ]);

    const entries = filtered
        .map((row) => ({
            key: `${row.model_id}:${row.provider}`,
            model_id: row.model_id,
            model_name: modelNameMap[row.model_id] ?? row.model_id,
            provider_id: row.provider,
            provider_name: providerMetaMap[row.provider]?.name ?? row.provider,
            throughput: Number(row.median_throughput ?? 0),
            requests: Number(row.requests ?? 0),
        }))
        .sort((a, b) => b.throughput - a.throughput);

    return <PerformanceLeaderboard data={entries} />;
}

async function MarketShareOrganizationLeaderboardServer() {
    const result = await getMarketShare("organization", "week");
    const filtered = (result.data ?? []).filter(
        (row) =>
            row.name &&
            row.name.toLowerCase() !== "unknown" &&
            Number(row.tokens ?? 0) > 0
    );
    const logoMap = await getOrganisationLogoIdsByNames(
        filtered.map((row) => row.name)
    );
    const totalTokens = filtered.reduce(
        (sum, row) => sum + Number(row.tokens ?? 0),
        0
    );
    const entries = filtered.map((row) => {
        const orgId = logoMap[row.name] ?? null;
        return {
            key: row.name,
            name: row.name,
            logo_id: orgId,
            href: orgId ? `/organisations/${encodeURIComponent(orgId)}` : null,
            tokens: Number(row.tokens ?? 0),
            share_pct:
                totalTokens > 0
                    ? (Number(row.tokens ?? 0) / totalTokens) * 100
                    : 0,
        };
    });
    entries.sort((a, b) => b.tokens - a.tokens);
    return <MarketShareLeaderboard data={entries} />;
}

async function MarketShareProviderLeaderboardServer() {
    const result = await getMarketShare("provider", "week");
    const providerIds = Array.from(
        new Set(
            (result.data ?? [])
                .map((row) => row.name)
                .filter(
                    (id) =>
                        id &&
                        id.toLowerCase() !== "unknown" &&
                        id.toLowerCase() !== "other"
                )
        )
    );
    const providerNameMap = await getProviderNamesByIds(providerIds);
    const filtered = (result.data ?? [])
        .map((row) => ({
            ...row,
            logo_id: row.name,
            name: providerNameMap[row.name] ?? row.name,
        }))
        .filter(
            (row) =>
                row.name &&
                row.name.toLowerCase() !== "unknown" &&
                Number(row.tokens ?? 0) > 0
        );
    const totalTokens = filtered.reduce(
        (sum, row) => sum + Number(row.tokens ?? 0),
        0
    );
    const entries = filtered.map((row) => {
        const providerId = row.logo_id ?? row.name;
        return {
            key: row.name,
            name: row.name,
            logo_id: providerId ?? null,
            href: providerId
                ? `/api-providers/${encodeURIComponent(providerId)}`
                : null,
            tokens: Number(row.tokens ?? 0),
            share_pct:
                totalTokens > 0
                    ? (Number(row.tokens ?? 0) / totalTokens) * 100
                    : 0,
        };
    });
    entries.sort((a, b) => b.tokens - a.tokens);
    return <MarketShareLeaderboard data={entries} />;
}

async function AppsUsageServer() {
    const [weekRes, todayRes, monthRes] = await Promise.all([
        getTopApps("week", 200),
        getTopApps("today", 100),
        getTopApps("month", 200),
    ]);

    const normalize = (rows: typeof weekRes.data) =>
        [...(rows ?? [])]
            .filter((row) => Number(row.tokens ?? 0) > 0)
            .sort((a, b) => Number(b.tokens ?? 0) - Number(a.tokens ?? 0))
            .slice(0, 20);

    return (
        <AppsUsageList
            dataByRange={{
                week: normalize(weekRes.data),
                today: normalize(todayRes.data),
                month: normalize(monthRes.data),
            }}
            defaultRange="week"
            showHeader
            title="Top Apps"
            icon={<AppWindow className="h-5 w-5" />}
        />
    );
}
