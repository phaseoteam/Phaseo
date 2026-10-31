// Generated from packages/shared/workspace-budgets/index.ts by scripts/sync-workspace-budgets.mjs. Do not edit.
// Workspace budgets: enforced spend ceilings for a whole workspace, one per
// interval. The gateway rejects a request with a 429 once the interval's spend
// reaches the limit; the windows are UTC calendar periods (midnight, Monday
// 00:00 and the 1st of the month), and a lifetime budget never resets.
//
// This is the one definition of a valid budget write. The control API, the
// settings API and the settings page each use a generated copy
// (scripts/sync-workspace-budgets.mjs), so they always accept the same input.
// Keep it dependency-free.

export const BUDGET_INTERVALS = ["daily", "weekly", "monthly", "lifetime"] as const;
export type BudgetInterval = (typeof BUDGET_INTERVALS)[number];

export const NANOS_PER_USD = 1_000_000_000;

export const BUDGET_INTERVAL_ERROR = "interval must be daily, weekly, monthly, or lifetime";
export const BUDGET_LIMIT_ERROR = "limit must be a positive USD amount";

/** Normalises an interval, or returns null when it is not one of BUDGET_INTERVALS. */
export function parseBudgetInterval(value: unknown): BudgetInterval | null {
	const interval = String(value ?? "").trim().toLowerCase();
	return (BUDGET_INTERVALS as readonly string[]).includes(interval) ? interval as BudgetInterval : null;
}

/**
 * A limit in USD, or null unless it is a finite positive amount whose nano
 * value is a positive safe integer (so it fits the bigint column exactly).
 */
export function parseBudgetLimitUsd(value: unknown): number | null {
	if (value === null || value === undefined || (typeof value === "string" && !value.trim())) return null;
	if (typeof value !== "number" && typeof value !== "string") return null;
	const amount = Number(value);
	const nanos = Math.round(amount * NANOS_PER_USD);
	return Number.isFinite(amount) && amount > 0 && nanos > 0 && Number.isSafeInteger(nanos) ? amount : null;
}

export function budgetUsdToNanos(value: number): number {
	return Math.round(value * NANOS_PER_USD);
}

export function budgetNanosToUsd(value: unknown): number {
	return Number(value ?? 0) / NANOS_PER_USD;
}

/** Display and enforcement order: the shortest window first. */
export function budgetIntervalRank(interval: string): number {
	const index = (BUDGET_INTERVALS as readonly string[]).indexOf(interval);
	return index < 0 ? BUDGET_INTERVALS.length : index;
}
