import { describe, expect, it } from "vitest";
import { isRealtimeSpendLimitReason } from "./realtime-sessions";

describe("isRealtimeSpendLimitReason", () => {
	it("treats workspace and department budget refusals from the hold RPCs as spend limits", () => {
		expect(isRealtimeSpendLimitReason("workspace_daily_cost_budget_reached")).toBe(true);
		expect(isRealtimeSpendLimitReason("department_weekly_cost_budget_reached")).toBe(true);
		expect(isRealtimeSpendLimitReason("realtime_session_not_found")).toBe(false);
	});
});
