import type { SettingsDepartmentBudget } from "@/lib/fetchers/internal/settingsTypes";

/** Department budgets have no lifetime window (workspace_department_budgets_interval_check). */
export const DEPARTMENT_BUDGET_INTERVALS = ["daily", "weekly", "monthly"] as const;
export type DepartmentBudgetInterval = (typeof DEPARTMENT_BUDGET_INTERVALS)[number];

/** The periods a department has no budget for yet: each department has at most one per period. */
export function freeDepartmentIntervals(budgets: SettingsDepartmentBudget[], departmentId: string): DepartmentBudgetInterval[] {
	const taken = new Set(budgets.filter((budget) => budget.department_id === departmentId).map((budget) => budget.interval));
	return DEPARTMENT_BUDGET_INTERVALS.filter((interval) => !taken.has(interval));
}

/** Departments that can still take a budget, in the order given. */
export function departmentsWithFreeIntervals<T extends { id: string }>(departments: T[], budgets: SettingsDepartmentBudget[]): T[] {
	return departments.filter((department) => freeDepartmentIntervals(budgets, department.id).length > 0);
}

/** Budgets grouped by department name, then shortest period first. */
export function sortDepartmentBudgets(budgets: SettingsDepartmentBudget[]): SettingsDepartmentBudget[] {
	return [...budgets].sort((a, b) =>
		(a.department_name ?? "").localeCompare(b.department_name ?? "")
		|| a.department_id.localeCompare(b.department_id)
		|| DEPARTMENT_BUDGET_INTERVALS.indexOf(a.interval) - DEPARTMENT_BUDGET_INTERVALS.indexOf(b.interval));
}
