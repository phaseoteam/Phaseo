import { describe, expect, it } from "vitest";

import { hasConfiguredKeyLimits } from "./context.shared";
import { gateCheckSchema } from "./schemas";

describe("gateCheckSchema department budgets", () => {
    it("keeps the department of a department budget refusal from the request context", () => {
        // The shape gateway_department_budget_status returns into key_limit_ok.
        const gate = gateCheckSchema.parse({
            ok: false,
            reason: "department_daily_cost_budget_reached",
            limit_window: "daily",
            limit_metric: "cost",
            current_value: 10_500_000_000,
            limit_value: 10_000_000_000,
            reset_at: "2026-11-05T00:00:00+00:00",
            now: "2026-11-04T12:00:00+00:00",
            department_id: "40000000-0000-4000-8000-000000000001",
            department_name: "Engineering",
            department_budgets: [{ id: "budget-1", department_id: "40000000-0000-4000-8000-000000000001", interval: "daily",
                limit_nanos: 10_000_000_000, usage_nanos: 10_500_000_000, exceeded: true }, { id: "malformed" }],
        });
        expect(gate).toMatchObject({
            ok: false,
            reason: "department_daily_cost_budget_reached",
            limitWindow: "daily",
            limitMetric: "cost",
            currentValue: 10_500_000_000,
            limitValue: 10_000_000_000,
            departmentId: "40000000-0000-4000-8000-000000000001",
            departmentName: "Engineering",
        });
        // The malformed entry is dropped; the valid one stays.
        expect(gate.departmentBudgets?.map((budget) => budget.id)).toEqual(["budget-1"]);
    });

    it("adds no department fields to other gates", () => {
        const gate = gateCheckSchema.parse({ ok: false, reason: "workspace_daily_cost_budget_reached", limit_window: "daily" });
        expect(gate).not.toHaveProperty("departmentId");
    });

    it("keeps the department budgets of an allowed context, which then counts as limited and is never cached", () => {
        const gate = gateCheckSchema.parse({
            ok: true,
            reason: null,
            department_budgets: [{
                id: "budget-1", department_id: "dept-1", department_name: "Engineering", interval: "daily",
                limit_nanos: 10_000_000_000, usage_nanos: "9000000000", remaining_nanos: 1_000_000_000, exceeded: false,
                window_start: "2026-11-04T00:00:00+00:00", reset_at: "2026-11-05T00:00:00+00:00",
            }],
        });
        expect(gate.departmentBudgets).toEqual([{
            id: "budget-1", departmentId: "dept-1", departmentName: "Engineering", interval: "daily",
            limitNanos: 10_000_000_000, usageNanos: 9_000_000_000, exceeded: false,
            windowStart: "2026-11-04T00:00:00+00:00", resetAt: "2026-11-05T00:00:00+00:00",
        }]);
        expect(hasConfiguredKeyLimits(gate)).toBe(true);
        expect(hasConfiguredKeyLimits(gateCheckSchema.parse({ ok: true, reason: null, department_budgets: [] }))).toBe(false);
    });
});
