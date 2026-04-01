import type { Metadata } from "next";
import Link from "next/link";
import { TrendingUp, Trophy } from "lucide-react";
import { RankingsEmptyState } from "@/components/(rankings)/RankingsEmptyState";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import TopAppsLeaderboardTable from "@/components/(data)/apps/TopAppsLeaderboardTable";
import { getPublicAppIdsCached } from "@/lib/fetchers/apps/getAppDetails";
import {
	getAppImageUrlsByIds,
	getTopApps,
	getTrendingApps,
	type TopAppData,
	type TrendingAppData,
} from "@/lib/fetchers/rankings/getRankingsData";
import { buildMetadata } from "@/lib/seo";

const TOP_APPS_QUERY_LIMIT = 300;
const MOST_POPULAR_LIMIT = 4;
const TRENDING_LIMIT = 12;
const LEADERBOARD_LIMIT = 100;

type PublicAppUsage = {
	appId: string;
	appName: string;
	tokens: number;
	requests: number;
	uniqueModels: number;
	imageUrl?: string | null;
};

type TrendingPublicApp = {
	appId: string;
	appName: string;
	currentWeekTokens: number;
	previousWeekTokens: number;
	growthTokens: number;
	growthPct: number | null;
	imageUrl?: string | null;
};

export const metadata: Metadata = buildMetadata({
	title: "Apps - Usage Rankings & Trends | AI Stats",
	description:
		"Discover popular apps on AI Stats Gateway, fastest-growing apps this week, and the top 100 app leaderboard by token usage.",
	path: "/apps",
	keywords: [
		"AI apps",
		"app leaderboard",
		"gateway usage",
		"app trends",
		"AI Stats",
	],
});

function formatCompactNumber(value: number): string {
	if (!Number.isFinite(value)) return "0";
	if (value >= 1e12) return `${(value / 1e12).toFixed(1)}T`;
	if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
	if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
	if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
	return value.toLocaleString();
}

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
			return { appId, appName, tokens, requests, uniqueModels };
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

export default async function AppsPage() {
	const [publicAppIds, top4wResult, trendingResult] = await Promise.all([
		getPublicAppIdsCached(),
		getTopApps("4w", TOP_APPS_QUERY_LIMIT),
		getTrendingApps(TOP_APPS_QUERY_LIMIT),
	]);

	const publicAppSet = new Set(publicAppIds);
	const topApps = normalizeTopApps(top4wResult.data, publicAppSet);
	const leaderboardApps = topApps.slice(0, LEADERBOARD_LIMIT);
	let growthApps = normalizeTrendingApps(
		trendingResult.data,
		publicAppSet,
	);

	if (growthApps.length === 0) {
		const weekResult = await getTopApps("week", TOP_APPS_QUERY_LIMIT);
		growthApps = deriveTrendingFallbackApps(
			weekResult.data,
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
	let trendingApps = growthApps.slice(0, TRENDING_LIMIT);

	const appIdsForImages = Array.from(
		new Set([
			...leaderboardApps.map((app) => app.appId),
			...trendingApps.map((app) => app.appId),
		]),
	);
	const imageUrlsById = await getAppImageUrlsByIds(appIdsForImages);

	return (
		<div className="container mx-auto py-8 space-y-12">
			<header className="space-y-2">
				<h1 className="text-3xl font-bold tracking-tight">App & Agent Rankings</h1>
				<p className="text-sm text-muted-foreground">
					Live app usage insights from AI Stats Gateway.
				</p>
			</header>

			<section className="space-y-4">
				<div className="space-y-1">
					<h2 className="text-2xl font-semibold">Most Popular</h2>
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
					<div className="grid gap-3 md:grid-cols-2">
						{popularApps.map((app, index) => (
							<div
								key={app.appId}
								className="flex items-center justify-between rounded-lg border border-border/60 bg-background/80 px-3 py-2"
							>
								<div className="flex min-w-0 items-center gap-3">
									<span className="w-8 text-xs text-zinc-500 dark:text-zinc-400">
										#{index + 1}
									</span>
									<Link
										href={`/apps/${encodeURIComponent(app.appId)}`}
										className="flex min-w-0 items-center gap-3"
									>
										<Avatar className="h-9 w-9 rounded-lg border border-border/60">
											<AvatarImage
												src={imageUrlsById[app.appId] ?? undefined}
												alt={app.appName}
												className="object-cover"
											/>
											<AvatarFallback className="rounded-lg text-xs font-semibold">
												{getInitial(app.appName)}
											</AvatarFallback>
										</Avatar>
										<span className="truncate text-sm font-medium text-foreground">
											{app.appName}
										</span>
									</Link>
								</div>
								<div className="text-right">
									<div className="text-sm font-semibold tabular-nums text-foreground">
										{formatCompactNumber(app.tokens)}
									</div>
									<div className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
										<TrendingUp className="h-3 w-3" />
										{formatPercent(app.growthPct)}
									</div>
								</div>
							</div>
						))}
					</div>
				)}
			</section>

			<section className="space-y-4">
				<div className="flex items-end justify-between gap-3">
					<div className="space-y-1">
						<h2 className="text-2xl font-semibold">Trending</h2>
						<p className="text-sm text-muted-foreground">
							Fastest growing apps this week by token growth.
						</p>
					</div>
					<span className="text-xs text-muted-foreground">Fastest growing this week</span>
				</div>
				{trendingApps.length === 0 ? (
					<RankingsEmptyState
						title="No trending app data yet"
						description="Trending apps appear once week-over-week growth is available."
					/>
				) : (
					<div className="grid gap-3 md:grid-cols-2">
						{trendingApps.map((app, index) => (
							<div
								key={app.appId}
								className="flex items-center justify-between rounded-lg border border-border/60 bg-background/80 px-3 py-2"
							>
								<div className="flex min-w-0 items-center gap-3">
									<span className="w-8 text-xs text-zinc-500 dark:text-zinc-400">
										#{index + 1}
									</span>
									<Link
										href={`/apps/${encodeURIComponent(app.appId)}`}
										className="flex min-w-0 items-center gap-3"
									>
										<Avatar className="h-9 w-9 rounded-lg border border-border/60">
											<AvatarImage
												src={imageUrlsById[app.appId] ?? undefined}
												alt={app.appName}
												className="object-cover"
											/>
											<AvatarFallback className="rounded-lg text-xs font-semibold">
												{getInitial(app.appName)}
											</AvatarFallback>
										</Avatar>
										<span className="truncate text-sm font-medium text-foreground">
											{app.appName}
										</span>
									</Link>
								</div>
								<div className="text-right">
									<div className="text-sm font-semibold tabular-nums text-foreground">
										{formatCompactNumber(app.currentWeekTokens)}
									</div>
									<div className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
										<TrendingUp className="h-3 w-3" />
										{formatPercent(app.growthPct)}
									</div>
								</div>
							</div>
						))}
					</div>
				)}
			</section>

			<section className="space-y-4">
				<div className="space-y-1">
					<h2 className="inline-flex items-center gap-2 text-2xl font-semibold">
						<Trophy className="h-5 w-5 text-muted-foreground" />
						Top Leaderboard
					</h2>
					<p className="text-sm text-muted-foreground">
						Top 100 apps by token usage over the last 4 weeks.
					</p>
				</div>
				{leaderboardApps.length === 0 ? (
					<RankingsEmptyState
						title="No leaderboard data yet"
						description="Top apps appear once public usage data is available."
					/>
				) : (
					<TopAppsLeaderboardTable
						rows={leaderboardApps}
						imageUrlsById={imageUrlsById}
					/>
				)}
			</section>
		</div>
	);
}
