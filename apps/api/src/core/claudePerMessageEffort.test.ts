import { describe, expect, it } from "vitest";
import type { IREffortRecord, IRMessage } from "@core/ir";
import { effectiveEffortFromMarkers, planClaudePerMessageEffort } from "./claudePerMessageEffort";

const user = (text: string): IRMessage => ({ role: "user", content: [{ type: "text", text }] });
const assistant = (text: string, effortRecord?: IREffortRecord): IRMessage => ({
	role: "assistant",
	content: [{ type: "text", text }],
	...(effortRecord ? { effortRecord } : {}),
});
const toolCall = (id: string, effortRecord?: IREffortRecord): IRMessage => ({
	role: "assistant",
	content: [],
	toolCalls: [{ id, name: "lookup", arguments: "{}" }],
	...(effortRecord ? { effortRecord } : {}),
});
const toolResult = (id: string): IRMessage => ({ role: "tool", toolResults: [{ toolCallId: id, content: "ok" }] });

describe("planClaudePerMessageEffort", () => {
	it("sends the requested effort at the top level on the first turn", () => {
		const plan = planClaudePerMessageEffort([user("hi")], "high", "claude-opus-5-5");
		expect(plan).toEqual({
			topLevel: "high",
			markersAfter: new Map(),
			record: { effort: "high", base: "high" },
			mode: "none",
		});
	});

	it("keeps the base at the top level and adds a marker when the effort changes", () => {
		const messages = [user("plan it"), assistant("plan", { effort: "high", base: "high" }), user("summarise")];
		const plan = planClaudePerMessageEffort(messages, "low", "claude-opus-5-5");
		expect(plan.topLevel).toBe("high");
		expect([...plan.markersAfter]).toEqual([[2, "low"]]);
		expect(plan.record).toEqual({ effort: "low", base: "high" });
		expect(plan.mode).toBe("per_message");
	});

	it("puts earlier markers back in the same place on later requests", () => {
		// Request 2 put a low marker after message 2; request 3 must send it there again.
		const messages = [
			user("plan it"),
			assistant("plan", { effort: "high", base: "high" }),
			user("summarise"),
			assistant("short", { effort: "low", base: "high" }),
			user("thanks"),
		];
		const plan = planClaudePerMessageEffort(messages, "low", "claude-opus-5-5");
		expect(plan.topLevel).toBe("high");
		expect([...plan.markersAfter]).toEqual([[2, "low"]]);
		expect(plan.record).toEqual({ effort: "low", base: "high" });
		expect(plan.mode).toBe("none");
	});

	it("adds a new marker when the effort goes back up", () => {
		const messages = [
			user("plan it"),
			assistant("plan", { effort: "high", base: "high" }),
			user("summarise"),
			assistant("short", { effort: "low", base: "high" }),
			user("now go deep"),
		];
		const plan = planClaudePerMessageEffort(messages, "high", "claude-opus-5-5");
		expect([...plan.markersAfter]).toEqual([[2, "low"], [4, "high"]]);
		expect(plan.record).toEqual({ effort: "high", base: "high" });
	});

	it("keeps a tool loop on the level its turn started with", () => {
		const messages = [
			user("plan it"),
			assistant("plan", { effort: "high", base: "high" }),
			user("look it up"),
			toolCall("call_1", { effort: "low", base: "high" }),
			toolResult("call_1"),
		];
		const plan = planClaudePerMessageEffort(messages, "low", "claude-opus-5-5");
		expect([...plan.markersAfter]).toEqual([[2, "low"]]);
		expect(plan.mode).toBe("none");
	});

	it("changes the top level when the effort changes between tool-loop steps", () => {
		const messages = [
			user("look it up"),
			toolCall("call_1", { effort: "high", base: "high" }),
			toolResult("call_1"),
		];
		const plan = planClaudePerMessageEffort(messages, "low", "claude-opus-5-5");
		expect(plan).toEqual({
			topLevel: "low",
			markersAfter: new Map(),
			record: { effort: "low", base: "low" },
			mode: "top_level",
		});
	});

	it("ignores records from before the last top-level change", () => {
		const messages = [
			user("one"),
			assistant("a", { effort: "high", base: "high" }),
			user("two"),
			assistant("b", { effort: "medium", base: "high" }),
			user("three"),
			assistant("c", { effort: "low", base: "low" }),
			user("four"),
		];
		const plan = planClaudePerMessageEffort(messages, "low", "claude-opus-5-5");
		expect(plan.topLevel).toBe("low");
		expect(plan.markersAfter.size).toBe(0);
	});

	it("starts over when the latest reply carries no record", () => {
		const messages = [user("one"), assistant("a", { effort: "high", base: "high" }), user("two"), assistant("b"), user("three")];
		const plan = planClaudePerMessageEffort(messages, "low", "claude-opus-5-5");
		expect(plan.topLevel).toBe("low");
		expect(plan.markersAfter.size).toBe(0);
		expect(plan.record).toEqual({ effort: "low", base: "low" });
	});

	it("leaves the top level out when the conversation started without one", () => {
		const messages = [user("one"), assistant("a", { effort: "medium", base: "default" }), user("two")];
		// Opus 5.5 defaults to medium, so asking for medium is no change.
		expect(planClaudePerMessageEffort(messages, "medium", "claude-opus-5-5")).toMatchObject({
			topLevel: undefined,
			mode: "none",
			record: { effort: "medium", base: "default" },
		});
		const plan = planClaudePerMessageEffort(messages, "max", "claude-opus-5-5");
		expect(plan.topLevel).toBeUndefined();
		expect([...plan.markersAfter]).toEqual([[2, "max"]]);
	});
});

describe("effectiveEffortFromMarkers", () => {
	const marker = (effort: "low" | "high"): IRMessage => ({ role: "system", content: [], effort });

	it("applies a marker straight after the last user turn to this reply", () => {
		expect(effectiveEffortFromMarkers([user("a"), marker("low")])).toBe("low");
	});

	it("applies an earlier marker from the next user turn", () => {
		expect(effectiveEffortFromMarkers([user("a"), assistant("b"), marker("low"), user("c")])).toBe("low");
	});

	it("does not apply a marker after tool results to this reply", () => {
		expect(effectiveEffortFromMarkers([user("a"), toolCall("c1"), toolResult("c1"), marker("low")])).toBeUndefined();
	});

	it("keeps a marker that followed the user turn in force through its tool loop", () => {
		expect(effectiveEffortFromMarkers([user("a"), marker("low"), toolCall("c1"), toolResult("c1")])).toBe("low");
		expect(
			effectiveEffortFromMarkers([user("a"), marker("low"), toolCall("c1"), toolResult("c1"), toolCall("c2"), toolResult("c2")]),
		).toBe("low");
	});

	it("keeps an earlier level in force when a later marker waits for the next user turn", () => {
		expect(
			effectiveEffortFromMarkers([user("a"), marker("low"), toolCall("c1"), toolResult("c1"), marker("high")]),
		).toBe("low");
	});

	it("uses the latest marker in force", () => {
		expect(effectiveEffortFromMarkers([user("a"), marker("low"), assistant("b"), user("c"), marker("high")])).toBe("high");
	});
});
