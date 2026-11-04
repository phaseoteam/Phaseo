import { describe, expect, it } from "vitest";
import {
	guardrailKindForWrite,
	guardrailRow,
	inferGuardrailKind,
	MAX_ASSIGNMENT_GUARDRAILS,
	MAX_ASSIGNMENT_TARGETS,
	parseGuardrailAssignmentChange,
} from "./settings-guardrails";

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

	it("accepts department targets and workspace changes without targets", () => {
		expect(parseGuardrailAssignmentChange({ targetType: "department", targetIds: ["d-1"], addGuardrailIds: ["g-1"] }))
			.toEqual({ targetType: "department", targetIds: ["d-1"], addGuardrailIds: ["g-1"], removeGuardrailIds: [] });
		expect(parseGuardrailAssignmentChange({ targetType: "workspace", addGuardrailIds: ["g-1"] }))
			.toEqual({ targetType: "workspace", targetIds: [], addGuardrailIds: ["g-1"], removeGuardrailIds: [] });
	});

	it.each([
		["an unknown target type", { targetType: "team", targetIds: ["x"], addGuardrailIds: ["g"] }],
		["target ids on a workspace change", { targetType: "workspace", targetIds: ["x"], addGuardrailIds: ["g"] }],
		["no departments", { targetType: "department", targetIds: [], addGuardrailIds: ["g"] }],
		["a workspace change with nothing to change", { targetType: "workspace" }],
		["no targets", { targetType: "key", targetIds: [], addGuardrailIds: ["g"] }],
		["no change", { targetType: "key", targetIds: ["key-1"] }],
		["the same guardrail added and removed", { targetType: "key", targetIds: ["key-1"], addGuardrailIds: ["g"], removeGuardrailIds: ["g"] }],
		["too many targets", { targetType: "key", targetIds: Array.from({ length: MAX_ASSIGNMENT_TARGETS + 1 }, (_, i) => `key-${i}`), addGuardrailIds: ["g"] }],
		["too many guardrails", { targetType: "key", targetIds: ["key-1"], addGuardrailIds: Array.from({ length: MAX_ASSIGNMENT_GUARDRAILS + 1 }, (_, i) => `g-${i}`) }],
	])("rejects %s", (_label, body) => {
		expect(parseGuardrailAssignmentChange(body)).toHaveProperty("error");
	});
});

describe("guardrail kind", () => {
	it.each([
		["nothing on", {}, "access"],
		["prompt injection only", { promptInjectionEnabled: true }, "safety"],
		["sensitive info only", { sensitiveInfoEnabled: true, privacyEnablePaidMayTrain: true, providerRestrictionMode: "none" }, "safety"],
		["sensitive info with ZDR", { sensitiveInfoEnabled: true, privacyZdrOnly: true }, "access"],
		["prompt injection with a provider allowlist", { promptInjectionEnabled: true, providerRestrictionMode: "allowlist" }, "access"],
		["prompt injection with training off", { promptInjectionEnabled: true, privacyEnablePaidMayTrain: false }, "access"],
		["a model blocklist", { modelRestrictionMode: "blocklist" }, "access"],
	])("infers %s", (_label, payload, kind) => {
		expect(inferGuardrailKind(payload)).toBe(kind);
	});

	it("infers the kind on create and keeps the stored one on an update without a kind", () => {
		expect(guardrailKindForWrite({ promptInjectionEnabled: true }, "create")).toEqual({ kind: "safety" });
		expect(guardrailKindForWrite({ promptInjectionEnabled: true }, "update")).toEqual({ kind: null });
	});

	it("uses an explicit kind, normalised", () => {
		expect(guardrailKindForWrite({ kind: " Safety ", privacyZdrOnly: true }, "create")).toEqual({ kind: "safety" });
		expect(guardrailKindForWrite({ kind: "access" }, "update")).toEqual({ kind: "access" });
	});

	it.each([["spend"], ["rate"]])("refuses %s until those settings exist", (kind) => {
		expect(guardrailKindForWrite({ kind }, "create")).toEqual({ error: "Spend and rate guardrails are not available yet" });
	});

	it("refuses an unknown kind", () => {
		expect(guardrailKindForWrite({ kind: "budget" }, "update")).toEqual({ error: "kind must be one of access, safety, spend, rate" });
	});
});
