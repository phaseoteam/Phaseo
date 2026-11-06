import { expect, it } from "vitest";
import type { Message, AgentActivity } from "../../shared/workspace";
import { conversationTurns, firstUnread, settingsChanges, turnDuration, userBursts } from "./conversationTurns";
import { effortName, turnSettings } from "../../shared/turnSettings";
it("groups complete turns while preserving commentary and tool order", () => {
	const messages = [{id:"u",role:"user",text:"Inspect",timelineOrder:1},{id:"comment",role:"assistant",text:"Checking",timelineOrder:2},{id:"final",role:"assistant",text:"Done",timelineOrder:4},{id:"next",role:"user",text:"Again",timelineOrder:5}] as Message[];
	const activities = [{id:"u:tool",type:"tool",timelineOrder:3}] as AgentActivity[];
	const turns = conversationTurns(messages, activities);
	expect(turns.map(turn => turn.id)).toEqual(["u","next"]);
	expect(turns[0].entries.map(entry => entry.value.id)).toEqual(["comment","u:tool","final"]);
});
it("retains partial history and never fabricates duration", () => {
	expect(conversationTurns([{id:"final",role:"assistant",text:"Done"}] as Message[],[])[0].entries).toHaveLength(1);
	expect(turnDuration()).toBe("Worked");
	expect(turnDuration({startedAt:"2026-10-05T00:00:00Z",completedAt:"2026-10-05T00:01:06Z"} as Message)).toBe("Worked for 1.1 min");
});
it("stacks your back-to-back messages as one burst with one steer label", () => {
	const messages = [
		{ id: "a", role: "user", text: "Fix it", timelineOrder: 1 }, { id: "reply", role: "assistant", text: "On it", timelineOrder: 2 },
		{ id: "s1", role: "user", text: "Also", delivery: "steer", timelineOrder: 3 }, { id: "s2", role: "user", text: "And this", delivery: "steer", timelineOrder: 4 },
		{ id: "b", role: "user", text: "Then", timelineOrder: 5 }, { id: "pr", role: "user", text: "Update", timelineOrder: 6, notice: { kind: "pull-request", summary: "x", outcome: "updated" } },
	] as Message[];
	expect(userBursts(conversationTurns(messages, []))).toEqual([
		undefined,
		{ previous: false, next: true, continuesSteer: false },
		{ previous: true, next: true, continuesSteer: true },
		{ previous: true, next: false, continuesSteer: false },
		undefined,
	]);
});
it("puts the new-since-your-visit line above what arrived after the visit", () => {
	const at = (minute: number) => `2026-10-31T10:${String(minute).padStart(2, "0")}:00.000Z`;
	const messages = [
		{ id: "a", role: "user", text: "Fix it", createdAt: at(0), timelineOrder: 1 }, { id: "a1", role: "assistant", text: "Done", createdAt: at(1), timelineOrder: 2 },
		{ id: "b", role: "user", text: "And this", createdAt: at(2), timelineOrder: 3 }, { id: "b1", role: "assistant", text: "Done too", createdAt: at(9), timelineOrder: 4 },
		{ id: "c", role: "user", text: "Next", createdAt: at(10), timelineOrder: 5 },
	] as Message[];
	const turns = conversationTurns(messages, []);
	expect(firstUnread(turns, at(5))).toEqual({ turnId: "b", at: "answer" });
	expect(firstUnread(turns, at(9))).toEqual({ turnId: "c", at: "start" });
	expect(firstUnread(turns, at(30))).toBeUndefined();
	expect(firstUnread(turns, undefined)).toBeUndefined();
});
it("marks the turns that ran with a different model or reasoning level from the one before", () => {
	const gpt = { harness: "phaseo", model: "openai/gpt-6", effort: "high" } as const;
	const messages = [
		{ id: "old", role: "user", text: "Before settings were recorded", timelineOrder: 1 },
		{ id: "a", role: "user", text: "First", timelineOrder: 2, settings: gpt },
		{ id: "b", role: "user", text: "Same", timelineOrder: 3, settings: gpt },
		{ id: "c", role: "user", text: "Lower", timelineOrder: 4, settings: { ...gpt, effort: "low" } },
		{ id: "d", role: "user", text: "Other model", timelineOrder: 5, settings: { harness: "claude", model: "opus" } },
	] as Message[];
	expect(Object.fromEntries(settingsChanges(conversationTurns(messages, [])))).toEqual({
		c: { settings: { ...gpt, effort: "low" }, modelChanged: false },
		d: { settings: { harness: "claude", model: "opus" }, modelChanged: true },
	});
});
it("reads a turn's reasoning level from the chat's effort or its model option", () => {
	expect(turnSettings({ harness: "codex", model: "gpt-6", reasoningEffort: "xhigh" })).toEqual({ harness: "codex", model: "gpt-6", effort: "xhigh" });
	expect(turnSettings({ harness: "claude", model: "opus", modelOptions: { contextWindow: "1m", effort: "max" } })).toEqual({ harness: "claude", model: "opus", effort: "max" });
	expect(turnSettings({ harness: "phaseo", model: "x" })).toEqual({ harness: "phaseo", model: "x" });
	expect(effortName("xhigh")).toBe("Extra high");
});
