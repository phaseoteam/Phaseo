import { describe, expect, it } from "vitest";
import { responseForError } from "./realtime-sessions";

describe("realtime session create errors", () => {
	it.each(["workspace_monthly_cost_budget_reached", "department_daily_cost_budget_reached"])(
		"answers %s from the hold RPC with a 429 naming the budget",
		async (reason) => {
			const response = responseForError(new Error(reason), "req_1", "ws_1");
			expect(response.status).toBe(429);
			expect(await response.json()).toMatchObject({ error: { code: "key_limit_exceeded", metadata: { reason } }, reason, request_id: "req_1", workspace_id: "ws_1" });
		},
	);
});
