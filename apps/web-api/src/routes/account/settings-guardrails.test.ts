import { describe, expect, it } from "vitest";
import { guardrailRow, MAX_ASSIGNMENT_GUARDRAILS, MAX_ASSIGNMENT_TARGETS, parseGuardrailAssignmentChange } from "./settings-guardrails";

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

describe("parseGuardrailAssignmentChange", () => {
	it("trims and de-duplicates ids", () => {
		expect(parseGuardrailAssignmentChange({
			targetType: "key",
			targetIds: [" key-1 ", "key-1", "", "key-2"],
			addGuardrailIds: ["g-1", "g-1"],
			removeGuardrailIds: ["g-2"],
		})).toEqual({ targetType: "key", targetIds: ["key-1", "key-2"], addGuardrailIds: ["g-1"], removeGuardrailIds: ["g-2"] });
	});

	it("accepts member targets with only removals", () => {
		expect(parseGuardrailAssignmentChange({ targetType: "member", targetIds: ["user-1"], removeGuardrailIds: ["g-1"] }))
			.toEqual({ targetType: "member", targetIds: ["user-1"], addGuardrailIds: [], removeGuardrailIds: ["g-1"] });
	});

	it.each([
		["an unknown target type", { targetType: "workspace", targetIds: ["x"], addGuardrailIds: ["g"] }],
		["no targets", { targetType: "key", targetIds: [], addGuardrailIds: ["g"] }],
		["no change", { targetType: "key", targetIds: ["key-1"] }],
		["the same guardrail added and removed", { targetType: "key", targetIds: ["key-1"], addGuardrailIds: ["g"], removeGuardrailIds: ["g"] }],
		["too many targets", { targetType: "key", targetIds: Array.from({ length: MAX_ASSIGNMENT_TARGETS + 1 }, (_, i) => `key-${i}`), addGuardrailIds: ["g"] }],
		["too many guardrails", { targetType: "key", targetIds: ["key-1"], addGuardrailIds: Array.from({ length: MAX_ASSIGNMENT_GUARDRAILS + 1 }, (_, i) => `g-${i}`) }],
	])("rejects %s", (_label, body) => {
		expect(parseGuardrailAssignmentChange(body)).toHaveProperty("error");
	});
});
