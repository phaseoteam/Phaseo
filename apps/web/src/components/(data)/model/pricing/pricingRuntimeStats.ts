import type {
	ProviderRuntimeStats,
	ProviderRuntimeStatsMap,
} from "@/lib/fetchers/models/getModelProviderRuntimeStats";

// The pricing table uses daily uptime; inspector charts use performanceHourly3d.
// The separate hourly uptime series is not read by either client component.
export type PricingRuntimeStats = Omit<ProviderRuntimeStats, "uptimeHourly3d">;
export type PricingRuntimeStatsMap = Record<string, PricingRuntimeStats>;

export function toPricingRuntimeStats(
	stats: ProviderRuntimeStatsMap,
	options: { includeHourlyPerformance?: boolean } = {},
): PricingRuntimeStatsMap {
	return Object.fromEntries(
		Object.entries(stats).map(([key, { uptimeHourly3d: _uptimeHourly3d, ...pricingStats }]) => [
			key,
			// Only the provider inspector draws the hourly series, and it opens on a
			// click. On public pages the table's runtime-stats query refetches the full
			// stats as soon as it mounts (its initial data counts as stale), so the page
			// doesn't need to carry them. Internal pages don't refetch, so keep them.
			options.includeHourlyPerformance
				? pricingStats
				: { ...pricingStats, performanceHourly3d: [] },
		]),
	);
}
