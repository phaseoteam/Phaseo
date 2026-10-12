import { expect, it } from "vitest";
import type { AgentActivity, Message } from "../../shared/workspace";
import { conversationTimeline } from "./conversationTimeline";

it("places each turn's activity before its final answer and omits whitespace replies", () => {
	const messages = [
		{ id: "u1", role: "user", text: "Inspect drives" },
		{ id: "empty", role: "assistant", text: "\n " },
		{ id: "a1", role: "assistant", text: "Found drives" },
		{ id: "u2", role: "user", text: "Follow up" },
		{ id: "a2", role: "assistant", text: "Final answer" },
	] as Message[];
	const activities = [{ id: "u1:reasoning", type: "reasoning" }, { id: "u1:tool", type: "tool" }, { id: "u2:reasoning", type: "reasoning" }] as AgentActivity[];
	expect(conversationTimeline(messages, activities).map(entry => entry.value.id)).toEqual(["u1", "u1:reasoning", "u1:tool", "a1", "u2", "u2:reasoning", "a2"]);
});

it("retains activity whose user message is outside the loaded history page", () => {
	const activity = { id: "older:tool", type: "tool" } as AgentActivity;
	expect(conversationTimeline([{ id: "answer", role: "assistant", text: "Answer" } as Message], [activity]).map(entry => entry.value.id)).toEqual(["older:tool", "answer"]);
});

it("interleaves text, reasoning and tools using first-observed order", () => {
	const messages = [{ id: "u", role: "user", text: "Inspect", timelineOrder: 1 }, { id: "preface", role: "assistant", text: "Checking", timelineOrder: 2 }, { id: "final", role: "assistant", text: "Done", timelineOrder: 5 }] as Message[];
	const activities = [{ id: "u:reason", type: "reasoning", timelineOrder: 3 }, { id: "u:tool", type: "tool", timelineOrder: 4 }] as AgentActivity[];
	expect(conversationTimeline(messages, activities).map(entry => entry.value.id)).toEqual(["u", "preface", "u:reason", "u:tool", "final"]);
	expect(conversationTimeline(messages.slice(1), activities).map(entry => entry.value.id)).toEqual(["preface", "u:reason", "u:tool", "final"]);
});

it("keeps usage metadata out of the conversation, including usage-only turns", () => {
	const messages = [{ id: "u", role: "user", text: "Hi" }, { id: "a", role: "assistant", text: "Hello" }] as Message[];
	const usage = { id: "u:usage", type: "usage", text: "{}" } as AgentActivity;
	expect(conversationTimeline(messages, [usage]).map(entry => entry.value.id)).toEqual(["u", "a"]);
	expect(usage.text).toBe("{}");
});
