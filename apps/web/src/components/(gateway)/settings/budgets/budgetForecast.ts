import { forecastLimitWindow, type LimitWindow, type LimitWindowForecast } from "@/lib/gateway/usage/limitForecast";
import type { SettingsWorkspaceBudget } from "@/lib/fetchers/internal/settingsTypes";
import { BUDGET_INTERVALS, type BudgetInterval } from "./workspaceBudgets";

/**
 * Budgets reset on the same UTC calendar windows as key limits (date_trunc in
 * gateway_workspace_budget_status), so the key limit forecast applies as is.
 * Lifetime budgets have no window and so no projection.
 */
export const BUDGET_WINDOWS: Record<BudgetInterval, LimitWindow | null> = {
	daily: "day",
	weekly: "week",
	monthly: "month",
	lifetime: null,
};

export type BudgetSlot = { interval: BudgetInterval; budget: SettingsWorkspaceBudget | null };

/** One slot per interval, shortest first: a workspace has at most one budget per interval. */
export function budgetSlots(budgets: SettingsWorkspaceBudget[]): BudgetSlot[] {
	return BUDGET_INTERVALS.map((interval) => ({
		interval,
		budget: budgets.find((budget) => budget.interval === interval) ?? null,
	}));
}

/**
 * The end-of-window projection in USD, or null when there is nothing useful to
 * show: lifetime budgets, too little of the window gone, already used up, or
 * a pace that stays at or below the usage so far.
 */
export function budgetProjection(budget: SettingsWorkspaceBudget, now: number): LimitWindowForecast | null {
	const window = BUDGET_WINDOWS[budget.interval];
	if (!window || budget.exceeded) return null;
	const forecast = forecastLimitWindow({ window, used: budget.usage_usd, limit: budget.limit_usd, now });
	return forecast && forecast.projected > budget.usage_usd ? forecast : null;
}

/** Percent of the limit used, for display: one decimal under 10%, whole numbers above. */
export function budgetPercentFraction(budget: Pick<SettingsWorkspaceBudget, "percent_used">): { fraction: number; digits: number } {
	const percent = Math.max(0, Number(budget.percent_used) || 0);
	return { fraction: percent / 100, digits: percent > 0 && percent < 10 ? 1 : 0 };
}

/** The meter colour state: used up, past 80% (the same point as the spend warning push), or fine. */
export function budgetTone(budget: Pick<SettingsWorkspaceBudget, "percent_used" | "exceeded">): "exceeded" | "warning" | "ok" {
	if (budget.exceeded) return "exceeded";
	return budget.percent_used >= 80 ? "warning" : "ok";
}
