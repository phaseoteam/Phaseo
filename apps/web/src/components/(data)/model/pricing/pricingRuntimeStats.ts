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
): PricingRuntimeStatsMap {
	return Object.fromEntries(
		Object.entries(stats).map(([key, { uptimeHourly3d: _uptimeHourly3d, ...pricingStats }]) => [key, pricingStats]),
	);
}
