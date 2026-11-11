import { describe, it, expect } from "vitest";
import type { SettingsDepartmentBudget } from "@/lib/fetchers/internal/settingsTypes";
import { departmentsWithFreeIntervals, freeDepartmentIntervals, sortDepartmentBudgets } from "./departmentBudgets";

function budget(departmentId: string, interval: SettingsDepartmentBudget["interval"], name: string | null = departmentId): SettingsDepartmentBudget {
	return {
		id: `${departmentId}-${interval}`, department_id: departmentId, department_name: name, interval,
		limit_usd: 10, limit_nanos: 10e9, usage_usd: 0, usage_nanos: 0, remaining_nanos: 10e9, percent_used: 0, exceeded: false,
		window_start: null, reset_at: null, created_by: null, created_at: "", updated_at: "",
	};
}

describe("department budgets", () => {
	it("offers only the periods a department has no budget for", () => {
		const budgets = [budget("a", "weekly"), budget("b", "daily")];
		expect(freeDepartmentIntervals(budgets, "a")).toEqual(["daily", "monthly"]);
		expect(freeDepartmentIntervals(budgets, "c")).toEqual(["daily", "weekly", "monthly"]);
	});

	it("leaves out departments that already have all three budgets", () => {
		const budgets = [budget("a", "daily"), budget("a", "weekly"), budget("a", "monthly"), budget("b", "daily")];
		expect(departmentsWithFreeIntervals([{ id: "a" }, { id: "b" }], budgets)).toEqual([{ id: "b" }]);
	});

	it("groups by department name, shortest period first", () => {
		const sorted = sortDepartmentBudgets([budget("2", "monthly", "Sales"), budget("1", "weekly", "Research"), budget("2", "daily", "Sales"), budget("1", "daily", "Research")]);
		expect(sorted.map((entry) => entry.id)).toEqual(["1-daily", "1-weekly", "2-daily", "2-monthly"]);
	});
});
