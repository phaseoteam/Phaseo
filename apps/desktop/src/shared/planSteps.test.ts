import { describe, expect, it } from "vitest";
import { parsePlanSteps } from "./planSteps";

describe("native plan steps", () => {
	it("preserves order and literal content while normalizing provider statuses", () => {
		expect(parsePlanSteps([{ step: "Inspect 世界", status: "completed" }, { step: "<script> remains text", status: "inProgress" }, { step: "Verify", status: "pending" }], "codex")).toEqual([{ text: "Inspect 世界", status: "completed" }, { text: "<script> remains text", status: "in_progress" }, { text: "Verify", status: "pending" }]);
		expect(parsePlanSteps([{ content: "Implement", status: "in_progress", activeForm: "Implementing" }], "claude")).toEqual([{ text: "Implement", status: "in_progress" }]);
		expect(parsePlanSteps([], "codex")).toEqual([]);
	});
	it("rejects malformed, unknown and excessive steps instead of inventing progress", () => {
		for (const value of [null, {}, [null], [{ step: "Inspect", status: "in_progress" }], [{ step: "", status: "pending" }], [{ step: "Do work", status: "unknown" }], [{ step: "x".repeat(10001), status: "pending" }], Array(201).fill({ step: "Work", status: "pending" })]) expect(parsePlanSteps(value, "codex")).toBeUndefined();
	});
	it("retains Cursor cancellation without accepting it for other native schemas", () => {
		expect(parsePlanSteps([{ content: "Next", status: "inProgress" }, { content: "Skipped 世界", status: "cancelled" }], "cursor")).toEqual([{ text: "Next", status: "in_progress" }, { text: "Skipped 世界", status: "cancelled" }]);
		expect(parsePlanSteps([{ content: "Next", status: "in_progress" }], "cursor")).toBeUndefined();
		for (const source of ["claude", "acp", "codex"] as const) expect(parsePlanSteps([{ content: "Skipped", step: "Skipped", status: "cancelled" }], source)).toBeUndefined();
	});
});
