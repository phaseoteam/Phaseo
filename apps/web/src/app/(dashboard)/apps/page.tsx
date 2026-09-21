import type { Metadata } from "next";
import Link from "next/link";
import { Flame, TrendingUp } from "lucide-react";
import { RankingsEmptyState } from "@/components/(rankings)/RankingsEmptyState";
import AppCategoryTags from "@/components/(data)/apps/AppCategoryTags";
import AppLogo from "@/components/(data)/apps/AppLogo";
import TopAppsLeaderboardTable from "@/components/(data)/apps/TopAppsLeaderboardTable";
import {
	type TopAppData,
	type TrendingAppData,
} from "@/lib/fetchers/rankings/getRankingsData";
import {
	fetchFrontendAppImageUrls,
	fetchFrontendPublicAppIds,
	fetchFrontendTopApps,
	fetchFrontendTrendingApps,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { buildMetadata } from "@/lib/seo";
import { getPublicAppPath } from "@/lib/apps/publicAppPath";
import { DisplayNumber } from "@/components/display/DisplayValue";

const TOP_APPS_QUERY_LIMIT = 100;
const MOST_POPULAR_LIMIT = 4;
const TRENDING_LIMIT = 6;
const LEADERBOARD_LIMIT = 100;

type PublicAppUsage = {
	appId: string;
	appName: string;
	appUrl?: string | null;
	appCategory?: string | null;
	tokens: number;
	requests: number;
	uniqueModels: number;
	imageUrl?: string | null;
};

type TrendingPublicApp = {
	appId: string;
	appName: string;
	appUrl: string | null | undefined;
	appCategory: string | null | undefined;
	currentWeekTokens: number;
	previousWeekTokens: number;
	growthTokens: number;
	growthPct: number | null;
	imageUrl?: string | null;
};

export const metadata: Metadata = buildMetadata({
	title: "AI App Rankings: Usage Trends & Top Apps",
	description:
		"See the most popular and fastest-growing AI apps on Phaseo Gateway, with leaderboard and token-usage trends.",
	path: "/apps",
	keywords: [
		"AI apps",
		"AI app rankings",
		"app leaderboard",
		"app usage trends",
		"app trends",
	],
	robots: { index: false, follow: true },
});

function formatPercent(value: number | null): string {
	if (value == null || !Number.isFinite(value)) return "New";
	const rounded = Math.round(value);
	return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}

function getInitial(name: string): string {
	return name.trim().charAt(0).toUpperCase() || "A";
}

function normalizeTopApps(
	rows: TopAppData[],
	publicAppIds: Set<string>,
): PublicAppUsage[] {
	return rows
		.map((row) => {
			const appId = row.app_id?.trim() ?? "";
			const appName = row.app_name?.trim() || appId;
			const tokens = Number(row.tokens ?? 0);
			const requests = Number(row.requests ?? 0);
			const uniqueModels = Number(row.unique_models ?? 0);
			return { appId, appName, appUrl: row.app_url, appCategory: row.app_category, tokens, requests, uniqueModels };
		})
		.filter(
			(row) =>
				Boolean(row.appId) &&
				publicAppIds.has(row.appId) &&
				Number.isFinite(row.tokens) &&
				row.tokens > 0,
		)
		.sort((a, b) => b.tokens - a.tokens);
}

function normalizeTrendingApps(
	rows: TrendingAppData[],
	publicAppIds: Set<string>,
): TrendingPublicApp[] {
	return rows
		.map((row) => {
			const appId = row.app_id?.trim() ?? "";
			const appName = row.app_name?.trim() || appId;
			const currentWeekTokens = Number(row.current_week_tokens ?? 0);
			const previousWeekTokens = Number(row.previous_week_tokens ?? 0);
			const growthTokens = Number(row.growth_tokens ?? 0);
			const growthPct =
				row.growth_pct == null
					? null
					: Number.isFinite(Number(row.growth_pct))
						? Number(row.growth_pct)
						: null;
			return {
				appId,
				appName,
				appUrl: row.app_url,
				appCategory: row.app_category,
				currentWeekTokens,
				previousWeekTokens,
				growthTokens,
				growthPct,
			};
		})
		.filter(
			(row) =>
				Boolean(row.appId) &&
				publicAppIds.has(row.appId) &&
				Number.isFinite(row.growthTokens) &&
				row.growthTokens > 0,
		)
		.sort((a, b) => b.growthTokens - a.growthTokens);
}

function deriveTrendingFallbackApps(
	weekRows: TopAppData[],
	fourWeekRows: PublicAppUsage[],
	publicAppIds: Set<string>,
): TrendingPublicApp[] {
	const weekById = new Map(
		normalizeTopApps(weekRows, publicAppIds).map((row) => [row.appId, row]),
	);

	return fourWeekRows
		.map((row) => {
			const currentWeek = weekById.get(row.appId);
			if (!currentWeek || currentWeek.tokens <= 0) return null;

			const estimatedPreviousWeek = Math.max(
				(row.tokens - currentWeek.tokens) / 3,
				0,
			);
			const growthTokens = currentWeek.tokens - estimatedPreviousWeek;
			if (!Number.isFinite(growthTokens) || growthTokens <= 0) return null;

			return {
				appId: row.appId,
				appName: row.appName,
				appUrl: currentWeek.appUrl ?? row.appUrl,
				appCategory: currentWeek.appCategory ?? row.appCategory,
				currentWeekTokens: currentWeek.tokens,
				previousWeekTokens: Math.round(estimatedPreviousWeek),
				growthTokens: Math.round(growthTokens),
				growthPct:
					estimatedPreviousWeek > 0
						? (growthTokens / estimatedPreviousWeek) * 100
						: null,
			};
		})
		.filter((row): row is TrendingPublicApp => Boolean(row))
		.sort((a, b) => b.growthTokens - a.growthTokens);
}

function PopularAppRow({
	app,
	index,
	imageUrl,
}: {
	app: PublicAppUsage & { growthPct: number | null };
	index: number;
	imageUrl?: string | null;
}) {
	return (
		<Link
			href={getPublicAppPath(app.appName)}
			className="group flex min-w-0 items-center gap-3 border-b border-border/60 py-4 transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
		>
			<span className="w-7 shrink-0 text-xs font-medium tabular-nums text-muted-foreground">#{index + 1}</span>
			<AppLogo
				src={imageUrl}
				alt={app.appName}
				fallback={getInitial(app.appName)}
				className="size-10"
				fallbackClassName="text-xs"
			/>
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-semibold group-hover:underline group-hover:underline-offset-4">{app.appName}</p>
				<p className="mt-0.5 text-xs text-muted-foreground"><DisplayNumber value={app.requests} options={{ maximumFractionDigits: 1 }} /> requests</p>
				<AppCategoryTags categoryCsv={app.appCategory} className="mt-1.5" />
			</div>
			<div className="shrink-0 text-right">
				<p className="text-base font-semibold tabular-nums tracking-tight sm:text-lg"><DisplayNumber value={app.tokens} options={{ maximumFractionDigits: 1 }} /></p>
				<p className="text-[11px] text-muted-foreground">tokens · 4 weeks</p>
				<span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
					<TrendingUp className="size-3" />
					{formatPercent(app.growthPct)}
				</span>
			</div>
		</Link>
	);
}

export default async function AppsPage() {
	const [publicAppIds, top4wResult, topTodayResult, topWeekResult, topMonthResult, trendingResult] = await Promise.all([
		fetchFrontendPublicAppIds(),
		fetchFrontendTopApps("4w", TOP_APPS_QUERY_LIMIT),
		fetchFrontendTopApps("today", TOP_APPS_QUERY_LIMIT),
		fetchFrontendTopApps("week", TOP_APPS_QUERY_LIMIT),
		fetchFrontendTopApps("month", TOP_APPS_QUERY_LIMIT),
		fetchFrontendTrendingApps(TOP_APPS_QUERY_LIMIT),
	]);

	const publicAppSet = new Set(publicAppIds);
	const topApps = normalizeTopApps(top4wResult.data, publicAppSet);
	const leaderboardApps = topApps.slice(0, LEADERBOARD_LIMIT);
	const leaderboardAppsByRange = {
		today: normalizeTopApps(topTodayResult.data, publicAppSet).slice(0, LEADERBOARD_LIMIT),
		week: normalizeTopApps(topWeekResult.data, publicAppSet).slice(0, LEADERBOARD_LIMIT),
		month: normalizeTopApps(topMonthResult.data, publicAppSet).slice(0, LEADERBOARD_LIMIT),
	};
	let growthApps = normalizeTrendingApps(
		trendingResult.data,
		publicAppSet,
	);

	if (growthApps.length === 0) {
		growthApps = deriveTrendingFallbackApps(
			topWeekResult.data,
			topApps,
			publicAppSet,
		);
	}

	const growthPctByAppId = new Map(
		growthApps.map((app) => [app.appId, app.growthPct]),
	);
	const popularApps = leaderboardApps
		.slice(0, MOST_POPULAR_LIMIT)
		.map((app) => ({ ...app, growthPct: growthPctByAppId.get(app.appId) ?? null }));
	const trendingApps = growthApps.slice(0, TRENDING_LIMIT);

	const appIdsForImages = Array.from(
		new Set([
			...leaderboardApps.map((app) => app.appId),
			...Object.values(leaderboardAppsByRange).flatMap((apps) => apps.map((app) => app.appId)),
			...trendingApps.map((app) => app.appId),
		]),
	);
	const imageUrlsById = await fetchFrontendAppImageUrls(appIdsForImages);

	return (
		<div className="container mx-auto w-full max-w-7xl space-y-10 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
			<header className="space-y-2">
				<h1 className="text-3xl font-bold tracking-tight">App & Agent Rankings</h1>
				<p className="text-sm text-muted-foreground">
					Live app usage insights from Phaseo Gateway.
				</p>
			</header>

			<section className="space-y-4" aria-labelledby="popular-apps-heading">
				<div className="space-y-1">
					<h2 id="popular-apps-heading" className="text-2xl font-semibold tracking-tight">Most Popular</h2>
					<p className="text-sm text-muted-foreground">
						Top 4 apps by token usage over the last 4 weeks.
					</p>
				</div>
				{popularApps.length === 0 ? (
					<RankingsEmptyState
						title="No app usage data yet"
						description="Public app rankings appear once gateway usage is recorded."
					/>
				) : (
					<div className="border-t border-border/70">
						{popularApps.map((app, index) => (
							<PopularAppRow
								key={app.appId}
								app={app}
								index={index}
								imageUrl={imageUrlsById[app.appId]}
							/>
						))}
					</div>
				)}
			</section>

			<section className="space-y-4" aria-labelledby="trending-apps-heading">
				<div className="flex items-end justify-between gap-3">
					<div className="space-y-1">
						<h2 id="trending-apps-heading" className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><Flame className="size-5 text-orange-500" />Trending</h2>
						<p className="text-sm text-muted-foreground">
							Fastest growing apps this week by token growth.
						</p>
					</div>
						<span className="hidden rounded-full border border-border/70 bg-muted/25 px-3 py-1.5 text-xs text-muted-foreground sm:inline-flex">Fastest growing this week</span>
				</div>
				{trendingApps.length === 0 ? (
					<RankingsEmptyState
						title="No trending app data yet"
						description="Trending apps appear once week-over-week growth is available."
					/>
				) : (
					<div className="border-t border-border/70">
						{trendingApps.map((app, index) => (
							<Link
								key={app.appId}
								href={getPublicAppPath(app.appName)}
				className="group flex min-w-0 items-center justify-between gap-4 border-b border-border/60 py-3.5 transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
							>
								<div className="flex min-w-0 items-center gap-3">
									<span className="w-8 text-xs text-zinc-500 dark:text-zinc-400">
										#{index + 1}
									</span>
									<AppLogo
										src={imageUrlsById[app.appId]}
										alt={app.appName}
										fallback={getInitial(app.appName)}
										className="size-9"
										fallbackClassName="text-xs"
									/>
									<span className="truncate text-sm font-medium text-foreground group-hover:underline group-hover:underline-offset-4">
										{app.appName}
									</span>
								</div>
								<div className="text-right">
									<div className="text-sm font-semibold tabular-nums text-foreground">
										<DisplayNumber value={app.currentWeekTokens} options={{ maximumFractionDigits: 1 }} />
									</div>
									<div className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
										<TrendingUp className="h-3 w-3" />
										{formatPercent(app.growthPct)}
									</div>
								</div>
							</Link>
						))}
					</div>
				)}
			</section>

			<section aria-label="Global app ranking">
				{leaderboardApps.length === 0 ? (
					<RankingsEmptyState
						title="No leaderboard data yet"
						description="Top apps appear once public usage data is available."
					/>
				) : (
					<TopAppsLeaderboardTable
						rowsByRange={leaderboardAppsByRange}
						imageUrlsById={imageUrlsById}
					/>
				)}
			</section>
		</div>
	);
}
