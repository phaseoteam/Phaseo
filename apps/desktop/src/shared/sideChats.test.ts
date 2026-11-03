import { describe, expect, it } from "vitest";
import type { Message, Task } from "./workspace";
import { bringBackBlocker, bringBackText, parseSideChatCommand, sideChatNote, sideChatNoteFor, sideChatOwnMessages, sideChatTitle, sideChatUnused } from "./sideChats";

const message = (id: string, role: Message["role"], text = id): Message => ({ id, role, text, createdAt: "2026-11-01T00:00:00.000Z" });
const side = (messages: Message[], changes: Partial<Task> = {}) => ({ delegation: { parentTaskId: "p", requestId: "r", kind: "side" as const, sourceMessageId: "a1" }, messages, queue: [], status: "idle" as const, archived: false, ...changes });

describe("side chat commands", () => {
	it("reads /side and /btw only as the whole message", () => {
		expect(parseSideChatCommand("/side why is this slow?")).toEqual({ prompt: "why is this slow?" });
		expect(parseSideChatCommand("  /BTW\nwhat does\nthis do  ")).toEqual({ prompt: "what does\nthis do" });
		expect(parseSideChatCommand("/side")).toEqual({ prompt: "" });
		expect(parseSideChatCommand("/sidebar")).toBeUndefined();
		expect(parseSideChatCommand("please /side this")).toBeUndefined();
	});
	it("titles a side chat from its question", () => {
		expect(sideChatTitle("")).toBe("Side chat");
		expect(sideChatTitle("what  is\nthis")).toBe("what is this");
		expect(sideChatTitle("x".repeat(80))).toHaveLength(60);
	});
});

describe("a side chat's own conversation", () => {
	const copied = [message("u1", "user"), message("a1", "assistant")];
	it("starts after the copied messages", () => {
		expect(sideChatOwnMessages(side([...copied, message("s1", "user")])).map(value => value.id)).toEqual(["s1"]);
		expect(sideChatUnused(side(copied))).toBe(true);
		expect(sideChatUnused(side(copied, { queue: [{ id: "q", text: "hi", createdAt: "" }] }))).toBe(false);
		expect(sideChatUnused(side([...copied, message("s1", "user")]))).toBe(false);
	});
	it("allows Bring back once it has replied and is not working", () => {
		expect(bringBackBlocker(side(copied))).toMatch(/after the side chat has replied/);
		expect(bringBackBlocker(side([...copied, message("s1", "user"), message("s2", "assistant", "Answer")], { status: "running" }))).toMatch(/finished its reply/);
		expect(bringBackBlocker(side([...copied, message("s1", "user"), message("s2", "assistant", "Answer")], { status: "completed" }))).toBeUndefined();
	});
	it("tells the agent it is a side chat on its first own message only", () => {
		const task = side([...copied, message("s1", "user"), message("s2", "assistant"), message("s3", "user")]);
		expect(sideChatNoteFor(task, "s1")).toBe(sideChatNote);
		expect(sideChatNoteFor(task, "s3")).toBe("");
		expect(sideChatNoteFor({ ...task, delegation: undefined }, "s1")).toBe("");
	});
	it("brings back the newest messages when they run long", () => {
		const text = bringBackText("Cookies", [message("s1", "user", "old ".repeat(9000)), message("s2", "assistant", "new answer"), message("n", "user", "notice")].map((value, index) => index === 2 ? { ...value, notice: { kind: "issue" as const, summary: "", outcome: "updated" as const } } : value));
		expect(text).toContain("(Earlier messages left out.)");
		expect(text).toContain("Side chat: new answer");
		expect(text).not.toContain("notice");
		expect(text.length).toBeLessThan(33_000);
	});
});
