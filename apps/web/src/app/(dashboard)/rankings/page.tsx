// app/(dashboard)/rankings/page.tsx
// Purpose: Public rankings page showing AI model usage statistics
// Why: Provides transparency and insights into model usage across the gateway
// How: Server component that fetches data and renders visualizations

import { Suspense } from "react";
import { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { PerformanceLandscapePanel } from "@/components/(rankings)/PerformanceLandscapePanel";
import { PerformanceLeaderboard } from "@/components/(rankings)/PerformanceLeaderboard";
import { MarketShareStackedBar } from "@/components/(rankings)/MarketShareStackedBar";
import { MarketShareLeaderboard } from "@/components/(rankings)/MarketShareLeaderboard";
import { UsageStackedBar } from "@/components/(rankings)/UsageStackedBar";
import { ModelLeaderboard } from "@/components/(rankings)/ModelLeaderboard";
import { AppsUsageList } from "@/components/(rankings)/AppsUsageList";
import { ChartSkeleton, ListSkeleton } from "@/components/(rankings)/Skeletons";
import { InlineInfoTooltip } from "@/components/(rankings)/InlineInfoTooltip";
import {
    Activity,
    AppWindow,
    Building2,
    Network,
    Trophy,
} from "lucide-react";
import {
    fetchFrontendAppImageUrls,
    fetchFrontendMarketShare,
    fetchFrontendMarketShareTimeseries,
    fetchFrontendModelNamesByIds,
    fetchFrontendModelLeaderboardMetaByIds,
    fetchFrontendModelRankings,
    fetchFrontendOrganisationLogoIdsByNames,
    fetchFrontendProviderMetaByIds,
    fetchFrontendProviderNamesByIds,
    fetchFrontendRankingPerformance,
    fetchFrontendRankingsIndexability,
    fetchFrontendRankingTimeseries,
    fetchFrontendTopApps,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";

export async function generateMetadata(): Promise<Metadata> {
	const indexability = await fetchFrontendRankingsIndexability();

	return buildMetadata({
		title: "AI Model Rankings: Usage, Cost, Latency & Throughput",
		description:
			"Track live AI model rankings using AI Stats gateway data, with cost, latency, throughput and provider breakdowns.",
		path: "/rankings",
		keywords: [
			"AI model rankings",
			"LLM rankings",
			"model latency",
			"model throughput",
			"AI usage statistics",
		],
		openGraph: {
			title: "AI Model Rankings: Live Usage Statistics",
			description:
				"Compare AI models by usage, cost, latency, and throughput with live gateway data and provider breakdowns.",
		},
		robots: indexability.shouldIndex
			? { index: true, follow: true }
			: { index: false, follow: true },
	});
}

export default async function RankingsPage() {
    return (
        <div className="container mx-auto space-y-16 px-4 py-8 sm:px-6 lg:px-8">
            <div className="space-y-8">
                {/* Leaderboard + Usage */}
                <section className="space-y-3">
                    <div className="space-y-1">
                        <h1 className="text-3xl font-bold">
                            AI Model Rankings{" "}
                            <span className="font-medium text-muted-foreground">on AI Stats</span>
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Based on real usage data from across AI Stats.
                        </p>
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
                <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                        <Building2 className="h-5 w-5 text-muted-foreground" />
                        <h3 className="text-xl font-semibold leading-8">Market Share by Organization</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                            Weekly organization share trends across the gateway.
                            <InlineInfoTooltip
                                label="What is an organization?"
                                description="An organization is the model creator or lab, such as OpenAI, Anthropic, or Google."
                            />
                        </span>
                    </p>
                </div>
                <Suspense fallback={<ChartSkeleton />}>
                    <MarketShareOrganizationServer />
                </Suspense>
            </section>
            <section className="space-y-4">
                <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                        <Network className="h-5 w-5 text-muted-foreground" />
                        <h3 className="text-xl font-semibold leading-8">Market Share by Provider</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                            Weekly provider share trends across routed traffic.
                            <InlineInfoTooltip
                                label="What is a provider?"
                                description="A provider is the API endpoint serving requests for a model, such as OpenAI API, Azure OpenAI, or Together."
                            />
                        </span>
                    </p>
                </div>
                <Suspense fallback={<ChartSkeleton />}>
                    <MarketShareProviderServer />
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
    const dayRes = await fetchFrontendRankingPerformance(24);
    const modelIds = Array.from(
        new Set(dayRes.data.map((row) => row.model_id).filter(Boolean))
    );
    const providerIds = Array.from(
        new Set(dayRes.data.map((row) => row.provider).filter(Boolean))
    );
    const [modelNameMap, modelMetaMap, providerMetaMap] = await Promise.all([
        fetchFrontendModelNamesByIds(modelIds),
        fetchFrontendModelLeaderboardMetaByIds(modelIds),
        fetchFrontendProviderMetaByIds(providerIds),
    ]);

    const dataWithMeta = dayRes.data.map((row) => ({
        ...row,
        model_name: modelNameMap[row.model_id] ?? row.model_id,
        organisation_id: modelMetaMap[row.model_id]?.organisation_id ?? null,
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
            subtitle="Cost, latency, and throughput based on the latest production requests."
            icon={<Activity className="h-5 w-5" />}
        />
    );
}

async function MarketShareOrganizationServer() {
    const [timeseriesResult, leaderboardResult] = await Promise.all([
        fetchFrontendMarketShareTimeseries("organization", "year", "week", 8),
        fetchFrontendMarketShare("organization", "year"),
    ]);

    const organisationNames = Array.from(
        new Set(
            (leaderboardResult.data ?? [])
                .map((row) => row.name)
                .filter((name) => name && name.toLowerCase() !== "unknown")
        )
    );
    const logoMap = await fetchFrontendOrganisationLogoIdsByNames(organisationNames);

    const chartData = (timeseriesResult.data ?? []).filter(
        (row) => row.name && row.name.toLowerCase() !== "unknown"
    );

    const filtered = (leaderboardResult.data ?? []).filter(
        (row) =>
            row.name &&
            row.name.toLowerCase() !== "unknown" &&
            Number(row.tokens ?? 0) > 0
    );
    const totalTokens = filtered.reduce(
        (sum, row) => sum + Number(row.tokens ?? 0),
        0
    );
    const entries = filtered
        .map((row) => ({
            key: row.name,
            name: row.name,
            logo_id: logoMap[row.name] ?? null,
            href: logoMap[row.name]
                ? `/organisations/${encodeURIComponent(logoMap[row.name])}`
                : null,
            tokens: Number(row.tokens ?? 0),
            share_pct:
                totalTokens > 0
                    ? (Number(row.tokens ?? 0) / totalTokens) * 100
                    : 0,
        }))
        .sort((a, b) => b.tokens - a.tokens);

    return (
        <>
            <MarketShareStackedBar
                data={chartData}
                dimension="organization"
                metric="tokens"
                normalizeToPercent
            />
            <MarketShareLeaderboard data={entries} />
        </>
    );
}

async function MarketShareProviderServer() {
    const [timeseriesResult, leaderboardResult] = await Promise.all([
        fetchFrontendMarketShareTimeseries("provider", "year", "week", 8),
        fetchFrontendMarketShare("provider", "year"),
    ]);

    const providerIds = Array.from(
        new Set(
            [...(timeseriesResult.data ?? []), ...(leaderboardResult.data ?? [])]
                .map((row) => row.name)
                .filter(
                    (id) =>
                        id &&
                        id.toLowerCase() !== "unknown" &&
                        id.toLowerCase() !== "other"
                )
        )
    );
    const providerNameMap = await fetchFrontendProviderNamesByIds(providerIds);

    const chartData = (timeseriesResult.data ?? [])
        .filter((row) => row.name && row.name.toLowerCase() !== "unknown")
        .map((row) => ({
            ...row,
            name: row.name === "Other" ? "Other" : providerNameMap[row.name] ?? row.name,
        }));

    const filtered = (leaderboardResult.data ?? [])
        .filter(
            (row) =>
                row.name &&
                row.name.toLowerCase() !== "unknown" &&
                row.name.toLowerCase() !== "other" &&
                Number(row.tokens ?? 0) > 0
        )
        .map((row) => ({
            ...row,
            display_name: providerNameMap[row.name] ?? row.name,
        }));
    const totalTokens = filtered.reduce(
        (sum, row) => sum + Number(row.tokens ?? 0),
        0
    );
    const entries = filtered
        .map((row) => ({
            key: row.name,
            name: row.display_name,
            logo_id: row.name,
            href: `/api-providers/${encodeURIComponent(row.name)}`,
            tokens: Number(row.tokens ?? 0),
            share_pct:
                totalTokens > 0
                    ? (Number(row.tokens ?? 0) / totalTokens) * 100
                    : 0,
        }))
        .sort((a, b) => b.tokens - a.tokens);

    return (
        <>
            <MarketShareStackedBar
                data={chartData}
                dimension="provider"
                metric="tokens"
                normalizeToPercent
            />
            <MarketShareLeaderboard data={entries} />
        </>
    );
}

async function UsageStackedBarServer() {
    const result = await fetchFrontendRankingTimeseries("year", "week", 8);
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
    const nameMap = await fetchFrontendModelNamesByIds(modelIds);
    return <UsageStackedBar data={result.data} metric="tokens" nameMap={nameMap} />;
}

async function ModelLeaderboardServer() {
    const [weekRes, todayRes, monthRes] = await Promise.all([
        fetchFrontendModelRankings("week", "tokens", 200),
        fetchFrontendModelRankings("today", "tokens", 50),
        fetchFrontendModelRankings("month", "tokens", 50),
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

    const metaMap = await fetchFrontendModelLeaderboardMetaByIds(allModelIds);

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
                prev_tokens: Number(
                    (row as { prev_total_tokens?: number }).prev_total_tokens ?? 0
                ),
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
            const trend: "up" | "down" | "same" =
                change > 0 ? "up" : change < 0 ? "down" : "same";
            return {
                ...entry,
                trend,
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
            title="Leaderboard"
            subtitle="Top models by token usage for the selected period."
            icon={<Trophy className="h-5 w-5 text-muted-foreground" />}
            defaultRange="week"
            showRangeControls
        />
    );
}

async function PerformanceLeaderboardServer() {
    const perfRes = await fetchFrontendRankingPerformance(24);
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
    const [modelNameMap, modelMetaMap, providerMetaMap] = await Promise.all([
        fetchFrontendModelNamesByIds(modelIds),
        fetchFrontendModelLeaderboardMetaByIds(modelIds),
        fetchFrontendProviderMetaByIds(providerIds),
    ]);

    const entries = filtered
        .map((row) => ({
            key: `${row.model_id}:${row.provider}`,
            model_id: row.model_id,
            model_name: modelNameMap[row.model_id] ?? row.model_id,
            organisation_id: modelMetaMap[row.model_id]?.organisation_id ?? null,
            provider_id: row.provider,
            provider_name: providerMetaMap[row.provider]?.name ?? row.provider,
            throughput: Number(row.median_throughput ?? 0),
            requests: Number(row.requests ?? 0),
        }))
        .sort((a, b) => b.throughput - a.throughput);

    return <PerformanceLeaderboard data={entries} />;
}

async function AppsUsageServer() {
    const [weekRes, todayRes, monthRes] = await Promise.all([
        fetchFrontendTopApps("week", 200),
        fetchFrontendTopApps("today", 100),
        fetchFrontendTopApps("month", 200),
    ]);

    const normalize = (rows: typeof weekRes.data) =>
        [...(rows ?? [])]
            .filter((row) => Number(row.tokens ?? 0) > 0)
            .sort((a, b) => Number(b.tokens ?? 0) - Number(a.tokens ?? 0))
            .slice(0, 20);

    const weekApps = normalize(weekRes.data);
    const todayApps = normalize(todayRes.data);
    const monthApps = normalize(monthRes.data);

    const appIds = Array.from(
        new Set(
            [...weekApps, ...todayApps, ...monthApps]
                .map((row) => row.app_id)
                .filter(Boolean)
        )
    );
    const appImages = await fetchFrontendAppImageUrls(appIds);
    const withImages = (rows: typeof weekApps) =>
        rows.map((row) => ({
            ...row,
            image_url: row.app_id ? appImages[row.app_id] ?? null : null,
        }));

    return (
        <AppsUsageList
            dataByRange={{
                week: withImages(weekApps),
                today: withImages(todayApps),
                month: withImages(monthApps),
            }}
            defaultRange="week"
            showHeader
            title="Top Apps"
            subtitle="Apps ranked by token usage across the selected timeframe."
            icon={<AppWindow className="h-5 w-5" />}
        />
    );
}
