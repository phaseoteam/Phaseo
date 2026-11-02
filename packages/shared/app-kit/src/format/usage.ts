// The website's usage dashboard formats (moved from components/(gateway)/usage/observability/ObservabilityHub.tsx and
// app/[locale]/(dashboard)/settings/usage/ObservabilityClient.tsx), so the mobile app's usage screen reads the same.

/** Requests and tokens on the usage dashboard: "12,345", then compact from 100,000 ("1.2M"). */
export function formatUsageNumber(value: number): string {
	return new Intl.NumberFormat("en", {
		notation: value >= 100000 ? "compact" : "standard",
		maximumFractionDigits: value >= 100000 ? 1 : 0,
	}).format(value);
}

/** Spend on the usage dashboard: "$0.00412", "$12.50", "$1,234" (no cents from $100). */
export function formatUsageUsd(value: number): string {
	const absoluteValue = Math.abs(value);
	const maximumFractionDigits =
		absoluteValue > 0 && absoluteValue < 0.01 ? 5 : absoluteValue >= 100 ? 0 : 2;
	return new Intl.NumberFormat("en", {
		style: "currency",
		currency: "USD",
		maximumFractionDigits,
	}).format(value);
}

/** A share or success rate, from a fraction: "12.3%". */
export function formatUsagePercent(value: number): string {
	return `${(value * 100).toFixed(1)}%`;
}

/** Spend on a chart axis: "$0.005" below a cent, otherwise as formatUsageUsd. */
export function formatUsageUsdAxis(value: number): string {
	if (value > 0 && value < 0.01) return `$${value.toFixed(3)}`;
	return formatUsageUsd(value);
}

/** A change's size, without its direction, which the dashboard shows with an arrow: "12.3". */
export function formatUsageDeltaPercent(value: number): string {
	return Math.abs(value).toFixed(1);
}

/** The change from the previous period in percent: 100 when it was zero and now isn't, null when both are zero. */
export function usageDeltaPercent(current: number, previous: number): number | null {
	if (previous === 0) return current > 0 ? 100 : null;
	return ((current - previous) / previous) * 100;
}
