/**
 * Chart formatting utilities
 * Handles large numbers, currencies, and axis labels
 */

/**
 * Format large numbers with K/M/B suffixes for chart axes
 * Examples: 1000 → 1K, 1500000 → 1.5M, 2300000000 → 2.3B
 */
export function formatAxisNumber(value: number): string {
	if (value === 0) return "0";

	const abs = Math.abs(value);
	const sign = value < 0 ? "-" : "";

	if (abs >= 1_000_000_000) {
		const formatted = (abs / 1_000_000_000).toFixed(1);
		return `${sign}${formatted.replace(/\.0$/, "")}B`;
	}
	if (abs >= 1_000_000) {
		const formatted = (abs / 1_000_000).toFixed(1);
		return `${sign}${formatted.replace(/\.0$/, "")}M`;
	}
	if (abs >= 1_000) {
		const formatted = (abs / 1_000).toFixed(1);
		return `${sign}${formatted.replace(/\.0$/, "")}K`;
	}

	return `${sign}${abs}`;
}

/**
 * Format currency for chart axes
 * Examples: 0.00123 → $0.001, 1234.56 → $1.2K, 1234567 → $1.2M
 */
export function formatAxisCurrency(value: number): string {
	if (value === 0) return "$0";

	const abs = Math.abs(value);
	const sign = value < 0 ? "-" : "";

	// For very small amounts (less than $0.01), show more precision
	if (abs < 0.01) {
		return `${sign}$${abs.toFixed(3)}`;
	}

	// For amounts less than $1000, show as-is with 2 decimals
	if (abs < 1_000) {
		return `${sign}$${abs.toFixed(2)}`;
	}

	// For larger amounts, use K/M/B notation
	if (abs >= 1_000_000_000) {
		const formatted = (abs / 1_000_000_000).toFixed(1);
		return `${sign}$${formatted.replace(/\.0$/, "")}B`;
	}
	if (abs >= 1_000_000) {
		const formatted = (abs / 1_000_000).toFixed(1);
		return `${sign}$${formatted.replace(/\.0$/, "")}M`;
	}
	if (abs >= 1_000) {
		const formatted = (abs / 1_000).toFixed(1);
		return `${sign}$${formatted.replace(/\.0$/, "")}K`;
	}

	return `${sign}$${abs.toFixed(2)}`;
}

/**
 * Format tooltip values with full precision
 * (This is for hover tooltips where we want exact values)
 */
export function formatTooltipNumber(value: number): string {
	return value.toLocaleString();
}

export function formatTooltipCurrency(value: number): string {
	return `$${value.toFixed(5)}`;
}
