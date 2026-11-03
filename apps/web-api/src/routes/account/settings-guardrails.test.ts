import { describe, expect, it } from "vitest";
import { guardrailRow } from "./settings-guardrails";

describe("guardrailRow", () => {
	it("ignores a legacy budgets object and never writes the removed limit columns", () => {
		const row = guardrailRow({
			name: "Default policy",
			privacyZdrOnly: true,
			budgets: { dailyRequests: 10, weeklyRequests: 20, monthlyRequests: 30, dailyCostNanos: 1, weeklyCostNanos: 2, monthlyCostNanos: 3 },
		});
		expect(row).toMatchObject({ name: "Default policy", description: null, enabled: true, privacy_zdr_only: true });
		expect(Object.keys(row).filter((key) => /_limit_(requests|cost_nanos)$/.test(key) || key === "budgets")).toEqual([]);
	});
});
