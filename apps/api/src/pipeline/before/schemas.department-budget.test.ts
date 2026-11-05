import { describe, expect, it } from "vitest";

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
            department_budgets: [{ id: "budget-1", interval: "daily" }],
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
    });

    it("adds no department fields to other gates", () => {
        const gate = gateCheckSchema.parse({ ok: false, reason: "workspace_daily_cost_budget_reached", limit_window: "daily" });
        expect(gate).not.toHaveProperty("departmentId");
    });
});
