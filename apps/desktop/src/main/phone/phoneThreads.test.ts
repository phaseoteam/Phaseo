import { afterEach, describe, expect, it, vi } from "vitest";
import type { DesktopFrame, PhoneMessage } from "@phaseo/phone-protocol";
import { fakePhoneHost } from "./fakePhoneHost";
import { turnSummary } from "./phoneChats";
import { PhoneHub } from "./phoneSession";

type Answer = { id: string; ok: boolean; result?: Record<string, unknown>; error?: { code: string; message: string } };

/** Organising, settings and queue (protocol 3): each runs the window's own command, and the window's list moves with it. */
describe("phone thread organisation and settings", () => {
	afterEach(() => { vi.useRealTimers(); });
	const connected = () => {
		const app = fakePhoneHost();
		app.addTask({ id: "chat-1", title: "Fix login", mode: "code", projectId: "p1" });
		const hub = new PhoneHub(app.host), frames: DesktopFrame[] = [];
		app.onChange(overview => hub.overviewChanged(overview));
		const session = hub.open({ id: "dev", name: "Pixel" }, frame => frames.push(frame));
		let next = 0;
		const ask = async (body: Record<string, unknown>) => {
			const id = `r${++next}`;
			await session.receive(JSON.stringify({ id, ...body }));
			return frames.find(frame => "id" in frame && frame.id === id) as unknown as Answer;
		};
		return { app, hub, session, frames, ask };
	};

	it("settles a chat and undoes it, as the window's sidebar does", async () => {
		const { app, ask } = connected();
		const settled = await ask({ type: "update_chat", chatId: "chat-1", action: "settle" });
		expect(settled).toMatchObject({ ok: true, result: { chat: { id: "chat-1", settled: true } } });
		expect(app.overview().tasks.find(task => task.id === "chat-1")?.settledOverride).toBe("settled");
		const undone = await ask({ type: "update_chat", chatId: "chat-1", action: "unsettle" });
		expect(undone.result!.chat).not.toHaveProperty("settled");
		expect(app.commands.slice(-2)).toEqual([{ type: "settle", id: "chat-1" }, { type: "unsettle", id: "chat-1" }]);
	});

	it("stops counting a settled chat as needing the person, as the window's Inbox does", async () => {
		const { app, ask } = connected();
		Object.assign(app.get("chat-1"), { status: "failed", error: "Crashed" });
		app.touch(app.get("chat-1"));
		expect((await ask({ type: "list_chats" })).result!.chats).toEqual([expect.objectContaining({ id: "chat-1", needsYou: true })]);
		expect((await ask({ type: "update_chat", chatId: "chat-1", action: "settle" })).result!.chat).toMatchObject({ settled: true, needsYou: false });
	});

	it("passes on the window's refusal, and won't touch an agent's chat", async () => {
		const { app, ask } = connected();
		app.get("chat-1").status = "running";
		expect(await ask({ type: "update_chat", chatId: "chat-1", action: "settle" })).toMatchObject({ ok: false, error: { code: "rejected", message: expect.stringContaining("still running") } });
		app.addTask({ id: "agent-1", title: "Helper", delegation: { parentTaskId: "chat-1" } as never });
		expect(await ask({ type: "update_chat", chatId: "agent-1", action: "pin" })).toMatchObject({ ok: false, error: { code: "not_found" } });
		expect(app.commands.filter(command => command.type === "update-task")).toEqual([]);
	});

	it("pins, renames and snoozes, and lists a snoozed chat with its time", async () => {
		const { app, ask } = connected();
		expect((await ask({ type: "update_chat", chatId: "chat-1", action: "pin" })).result!.chat).toMatchObject({ pinned: true });
		expect((await ask({ type: "update_chat", chatId: "chat-1", action: "rename", title: "Login fix" })).result!.chat).toMatchObject({ title: "Login fix" });
		const until = new Date(Date.now() + 3_600_000).toISOString();
		expect((await ask({ type: "update_chat", chatId: "chat-1", action: "snooze", until })).result!.chat).toMatchObject({ snoozedUntil: until });
		expect((await ask({ type: "update_chat", chatId: "chat-1", action: "wake" })).result!.chat).not.toHaveProperty("snoozedUntil");
		expect(app.commands.map(command => command.type)).toEqual(["update-task", "update-task", "snooze", "wake"]);
	});

	it("moves an archived chat to the archived list and back, and tells a phone that had it", async () => {
		vi.useFakeTimers();
		const { ask, frames } = connected();
		await ask({ type: "list_chats" });
		frames.length = 0;
		expect((await ask({ type: "update_chat", chatId: "chat-1", action: "archive" })).result!.chat).toMatchObject({ archived: true });
		vi.advanceTimersByTime(250);
		expect(frames).toContainEqual({ type: "chat_updated", chat: expect.objectContaining({ id: "chat-1", archived: true }) });
		expect((await ask({ type: "list_chats" })).result!.chats).toEqual([]);
		expect((await ask({ type: "list_chats", archived: true })).result!.chats).toEqual([expect.objectContaining({ id: "chat-1", archived: true })]);
		// An archived chat can't be read or sent to until it is restored.
		expect(await ask({ type: "read_chat", chatId: "chat-1" })).toMatchObject({ ok: false, error: { code: "not_found" } });
		await ask({ type: "update_chat", chatId: "chat-1", action: "unarchive" });
		expect((await ask({ type: "list_chats" })).result!.chats).toEqual([expect.objectContaining({ id: "chat-1" })]);
	});

	it("keeps a Codex effort on the chat and a Claude Code effort in its options", async () => {
		const { app, ask } = connected();
		app.addTask({ id: "codex-1", harness: "codex", model: "gpt-6.1", mode: "code" });
		app.addTask({ id: "claude-1", harness: "claude", model: "claude-opus-5-5", mode: "code", modelOptions: { thinking: true } });
		expect(await ask({ type: "set_chat", chatId: "codex-1", reasoningEffort: "xhigh" })).toMatchObject({ ok: true, result: { chat: { reasoningEffort: "xhigh", harness: "codex" } } });
		expect(app.commands.at(-1)).toEqual({ type: "update-task", id: "codex-1", reasoningEffort: "xhigh" });
		await ask({ type: "set_chat", chatId: "claude-1", reasoningEffort: "low" });
		// The model's other options stay.
		expect(app.commands.at(-1)).toEqual({ type: "update-task", id: "claude-1", modelOptions: { thinking: true, effort: "low" } });
		// Default goes back to the model's own effort, wherever the agent keeps it.
		expect(await ask({ type: "set_chat", chatId: "codex-1", defaultEffort: true })).toMatchObject({ ok: true, result: { chat: { harness: "codex" } } });
		expect(app.commands.at(-1)).toEqual({ type: "update-task", id: "codex-1", reasoningEffort: "" });
		expect(app.get("codex-1").reasoningEffort).toBeFalsy();
		await ask({ type: "set_chat", chatId: "claude-1", defaultEffort: true });
		expect(app.commands.at(-1)).toEqual({ type: "update-task", id: "claude-1", modelOptions: { thinking: true } });
		expect(await ask({ type: "set_chat", chatId: "codex-1", model: "gpt-6.1-mini", reasoningEffort: "low" })).toMatchObject({ ok: false, error: { message: "GPT-6.1 mini doesn't offer that effort." } });
		expect(await ask({ type: "set_chat", chatId: "codex-1", model: "claude-opus-5-5" })).toMatchObject({ ok: false, error: { message: expect.stringContaining("isn't available") } });
	});

	it("switches Code and Plan but never turns a chat into code, and waits for a running turn", async () => {
		const { app, ask } = connected();
		await ask({ type: "set_chat", chatId: "chat-1", mode: "plan" });
		expect(app.get("chat-1").mode).toBe("plan");
		app.addTask({ id: "plain", mode: "chat" });
		expect(await ask({ type: "set_chat", chatId: "plain", mode: "code" })).toMatchObject({ ok: false, error: { message: "A chat can switch only between Code and Plan." } });
		app.get("chat-1").status = "running";
		expect(await ask({ type: "set_chat", chatId: "chat-1", mode: "code" })).toMatchObject({ ok: false, error: { message: expect.stringContaining("Stop this task") } });
	});

	it("shows the queue, the permissions and linked pull requests, and edits the queue through the window's commands", async () => {
		const { app, ask } = connected();
		const task = app.get("chat-1");
		Object.assign(task, { status: "running", permissionMode: "accept-edits", queue: [{ id: "q1", text: "Then add a test", createdAt: "2026-11-01T10:00:00.000Z" }, { id: "q2", text: "And the docs", createdAt: "2026-11-01T10:00:01.000Z" }],
			pullRequests: [{ repository: "phaseo/phaseo", number: 12, url: "https://github.com/phaseo/phaseo/pull/12", linkedAt: "2026-11-01T10:00:00.000Z", source: "created", snapshot: { title: "Fix login", state: "open" } }] });
		await ask({ type: "subscribe", chatIds: ["chat-1"] });
		const read = await ask({ type: "read_chat", chatId: "chat-1" });
		expect(read.result!.chat).toMatchObject({ harness: "phaseo", permissionMode: "accept-edits", queue: [{ id: "q1", text: "Then add a test" }, { id: "q2", text: "And the docs" }], pullRequests: [{ number: 12, title: "Fix login", state: "open" }] });
		await ask({ type: "queue", chatId: "chat-1", messageId: "q2", action: "up" });
		await ask({ type: "queue", chatId: "chat-1", messageId: "q1", action: "edit", text: "Then add two tests" });
		await ask({ type: "queue", chatId: "chat-1", messageId: "q1", action: "steer" });
		await ask({ type: "queue", chatId: "chat-1", messageId: "q2", action: "remove" });
		expect(app.commands.slice(-4)).toEqual([
			{ type: "queue-move", id: "chat-1", messageId: "q2", direction: "up" },
			{ type: "queue-edit", id: "chat-1", messageId: "q1", text: "Then add two tests" },
			// Sent now uses the queued text, not the phone's copy.
			{ type: "steer", id: "chat-1", text: "Then add two tests", queuedId: "q1" },
			{ type: "queue-remove", id: "chat-1", messageId: "q2" },
		]);
		expect(await ask({ type: "queue", chatId: "chat-1", messageId: "gone", action: "remove" })).toMatchObject({ ok: false, error: { code: "not_found" } });
	});

	it("marks a queued message the phone gets cut, and won't let an edit of it drop the rest", async () => {
		const { app, ask } = connected();
		const long = `${"a".repeat(2_000)}the end`;
		Object.assign(app.get("chat-1"), { status: "running", queue: [{ id: "q1", text: long, createdAt: "2026-11-01T10:00:00.000Z" }] });
		const read = await ask({ type: "read_chat", chatId: "chat-1" });
		expect(read.result!.chat).toMatchObject({ queue: [{ id: "q1", truncated: true }] });
		const before = app.commands.length;
		expect(await ask({ type: "queue", chatId: "chat-1", messageId: "q1", action: "edit", text: "a".repeat(2_000) })).toMatchObject({ ok: false, error: { code: "rejected" } });
		expect(app.commands.length).toBe(before);
		expect(app.get("chat-1").queue[0]!.text).toBe(long);
	});

	it("adds each turn's changed files to its message once git has read them, reading each snapshot pair once", async () => {
		vi.useFakeTimers();
		const { app, ask, frames } = connected();
		app.checkpointFiles.set("t1:t2", [{ path: "src/login.ts", additions: 12, deletions: 3 }, { path: "src/login.test.ts", additions: 20, deletions: 0 }]);
		await ask({ type: "subscribe", chatIds: ["chat-1"] });
		await ask({ type: "read_chat", chatId: "chat-1" });
		app.addMessage("chat-1", { role: "user", text: "Fix it", checkpoint: { before: "t1", after: "t2" } });
		await vi.advanceTimersByTimeAsync(250);
		// Sent at once without its changes, which follow in the next batch once git has read them.
		const sent = frames.filter(frame => frame.type === "entries").flatMap(frame => frame.entries) as PhoneMessage[];
		expect(sent[0]).not.toHaveProperty("changes");
		await vi.advanceTimersByTimeAsync(250);
		expect(frames.at(-1)).toEqual({ type: "entries", chatId: "chat-1", entries: [expect.objectContaining({ role: "user", changes: { files: 2, additions: 32, deletions: 3 } })] });
		const again = await ask({ type: "read_chat", chatId: "chat-1" });
		expect((again.result!.entries as PhoneMessage[])[0]!.changes).toEqual({ files: 2, additions: 32, deletions: 3 });
		expect(app.turnReads).toEqual(["t1:t2"]);
	});

	it("sums a turn's lines, with -1 when only binary files changed", () => {
		expect(turnSummary([])).toEqual({ files: 0, additions: 0, deletions: 0 });
		expect(turnSummary([{ path: "logo.png", additions: -1, deletions: -1 }])).toEqual({ files: 1, additions: -1, deletions: -1 });
		expect(turnSummary([{ path: "logo.png", additions: -1, deletions: -1 }, { path: "a.ts", additions: 2, deletions: 1 }])).toEqual({ files: 2, additions: 2, deletions: 1 });
	});
});
