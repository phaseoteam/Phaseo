import { describe, expect, it } from "vitest";
import { normalizeGuardrailPatch } from "./guardrails";

describe("normalizeGuardrailPatch", () => {
	it("ignores the removed guardrail request and spend limits instead of rejecting them", () => {
		const patch = normalizeGuardrailPatch({
			name: "  Default policy  ",
			privacyZdrOnly: true,
			budgets: { dailyRequests: 10, monthlyCostNanos: 5_000_000_000 },
			daily_limit_requests: 10,
			weekly_limit_requests: 20,
			monthly_limit_requests: 30,
			daily_limit_cost_nanos: 1,
			weekly_limit_cost_nanos: 2,
			monthly_limit_cost_nanos: 3,
		});
		expect(patch).toEqual({ name: "Default policy", privacy_zdr_only: true });
	});
});
