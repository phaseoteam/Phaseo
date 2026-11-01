import { beforeAll, describe, expect, it } from "vitest";
import type { Message } from "../../shared/workspace";
import { chatPrompts, historyEntries, recentPrompts, recordPrompt, stepHistory } from "./promptHistory";
import { clearStash, stashedDraft, stashPrompt, takeStashed } from "./promptStash";
import { isSendKey } from "./sendKey";
import { ownQueue, queueSender, steerBlocker } from "./QueuePanel";

beforeAll(() => {
	const values = new Map<string, string>();
	globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, String(value)); }, removeItem: key => { values.delete(key); }, clear: () => values.clear(), key: () => null, length: 0 } as Storage;
});

const user = (text: string, extra: Partial<Message> = {}): Message => ({ id: text, role: "user", text, createdAt: "2026-10-27T00:00:00Z", ...extra });

describe("prompt history", () => {
	it("recalls only what the person typed, newest last and without repeats in a row", () => {
		expect(chatPrompts([user("One"), { ...user("Answer"), role: "assistant" }, user("One", { id: "again" }), user("Keep going", { autopilot: true }), user("PR update", { notice: { kind: "pull-request", summary: "merged", outcome: "completed" } }), user("Two")])).toEqual(["One", "Two"]);
	});
	it("steps through this chat first, then other chats, and back down to an empty box", () => {
		const entries = historyEntries(["Fix the test", "Ship it"], ["Ship it", "Elsewhere", "Older", "Elsewhere"]);
		expect(entries).toEqual(["Older", "Elsewhere", "Fix the test", "Ship it"]);
		const first = stepHistory("back", entries, undefined, "")!;
		expect(first.text).toBe("Ship it");
		const second = stepHistory("back", entries, first.position, first.text)!;
		expect(second.text).toBe("Fix the test");
		expect(stepHistory("back", entries, second.position, second.text)!.text).toBe("Elsewhere");
		expect(stepHistory("forward", entries, second.position, second.text)!.text).toBe("Ship it");
		expect(stepHistory("forward", entries, first.position, first.text)).toEqual({ text: "" });
	});
	it("never replaces typing, and leaves the caret alone with nothing to recall", () => {
		expect(stepHistory("back", ["One"], undefined, "half typed")).toBeUndefined();
		const recalled = stepHistory("back", ["One"], undefined, "")!;
		expect(stepHistory("back", ["One"], recalled.position, "One edited")).toBeUndefined();
		expect(stepHistory("back", [], undefined, "")).toBeUndefined();
		expect(stepHistory("forward", ["One"], undefined, "")).toBeUndefined();
	});
	it("keeps recent prompts across chats on this device, newest first", () => {
		recordPrompt("First"); recordPrompt("Second"); recordPrompt("First"); recordPrompt("  ");
		expect(recentPrompts()).toEqual(["First", "Second"]);
	});
});

describe("prompt stash", () => {
	it("parks drafts newest first and takes them back out", () => {
		clearStash();
		stashPrompt("Older", "chat-a"); stashPrompt("Newer", "chat-a"); stashPrompt("   ");
		expect(takeStashed()?.text).toBe("Newer");
		expect(takeStashed()?.text).toBe("Older");
		expect(takeStashed()).toBeUndefined();
	});
	it("leaves attachments behind in another chat, keeping files and chats", () => {
		const item = { id: "s", text: "See @[shot.png](attachment:a1) and @[Plan](chat:c1)", taskId: "chat-a", createdAt: "2026-10-27T00:00:00Z" };
		expect(stashedDraft(item, "chat-a")).toEqual({ text: item.text, dropped: 0 });
		expect(stashedDraft(item, "chat-b")).toEqual({ text: "See  and @[Plan](chat:c1)", dropped: 1 });
	});
});

describe("send key and steering", () => {
	const key = (patch: Partial<KeyboardEvent>) => ({ key: "Enter", shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, isComposing: false, repeat: false, ...patch });
	it("sends with Enter, or only with Mod+Enter when chosen", () => {
		expect(isSendKey(key({}), "enter", false)).toBe(true);
		expect(isSendKey(key({ shiftKey: true }), "enter", false)).toBe(false);
		expect(isSendKey(key({}), "mod+enter", false)).toBe(false);
		expect(isSendKey(key({ ctrlKey: true }), "mod+enter", false)).toBe(true);
		expect(isSendKey(key({ metaKey: true }), "mod+enter", true)).toBe(true);
		expect(isSendKey(key({ ctrlKey: true }), "mod+enter", true)).toBe(false);
		expect(isSendKey(key({ isComposing: true }), "enter", false)).toBe(false);
	});
	it("says plainly when a harness cannot take a message mid-turn", () => {
		expect(steerBlocker({ harness: "codex", status: "running" })).toBeUndefined();
		expect(steerBlocker({ harness: "claude", status: "running" })).toBe("Claude Code can't take messages mid-turn, so queued messages send when the turn finishes.");
		expect(steerBlocker({ harness: "codex", status: "completed" })).toContain("turn has finished");
		expect(ownQueue({ queue: [{ id: "a", text: "Mine", createdAt: "" }, { id: "b", text: "PR", createdAt: "", notice: { kind: "pull-request", summary: "x", outcome: "updated" } }, { id: "c", text: "Agent", createdAt: "", sourceTaskId: "t" }] }).map(item => item.id)).toEqual(["a"]);
	});
	it("names who a queued message is from when it is not you", () => {
		expect(queueSender({})).toBeUndefined();
		expect(queueSender({ autopilot: true })).toBe("Autopilot");
		expect(queueSender({ notice: { kind: "issue", summary: "x", outcome: "updated" } })).toBe("Issue update");
		expect(queueSender({ sourceTaskId: "t", sourceTaskIds: ["t", "u", "v"] }, id => id === "t" ? "Write tests" : undefined)).toBe("Write tests and 2 more");
		expect(queueSender({ sourceTaskId: "gone" })).toBe("Agent");
	});
});
