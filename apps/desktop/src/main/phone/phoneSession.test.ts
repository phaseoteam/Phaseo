import { afterEach, describe, expect, it, vi } from "vitest";
import { RequestRate, type DesktopFrame, type PhoneEntry } from "@phaseo/phone-protocol";
import { fakePhoneHost } from "./fakePhoneHost";
import { attentionOf, chatListPage, readingOrder } from "./phoneChats";
import { entryFrames, PhoneHub } from "./phoneSession";

describe("phone session", () => {
	afterEach(() => { vi.useRealTimers(); });
	const connected = () => {
		const app = fakePhoneHost();
		app.addTask({ id: "chat-1", title: "Streaming", status: "running", messages: [{ id: "a1", role: "assistant", text: "", createdAt: "2026-11-01T09:00:00.000Z" }] });
		const hub = new PhoneHub(app.host), frames: DesktopFrame[] = [];
		app.onChange(overview => hub.overviewChanged(overview));
		const session = hub.open({ id: "dev", name: "Pixel" }, frame => frames.push(frame));
		return { app, hub, session, frames };
	};

	it("sends a streaming reply's changes at most every 250 ms, with the latest text", async () => {
		vi.useFakeTimers();
		const { app, session, frames } = connected();
		await session.receive(JSON.stringify({ id: "1", type: "subscribe", chatIds: ["chat-1"] }));
		frames.length = 0;
		const reply = app.get("chat-1").messages[0]!;
		for (const text of ["Hel", "Hello", "Hello, wor", "Hello, world"]) { reply.text = text; app.touch(app.get("chat-1")); app.changed(); }
		expect(frames).toEqual([]);
		vi.advanceTimersByTime(250);
		expect(frames.filter(frame => frame.type === "entries")).toEqual([{ type: "entries", chatId: "chat-1", entries: [expect.objectContaining({ id: "a1", text: "Hello, world" })] }]);
		frames.length = 0;
		app.changed();
		vi.advanceTimersByTime(250);
		expect(frames.filter(frame => frame.type === "entries")).toEqual([]);
	});
	it("answers rate_limited past 50 requests a second for one device", async () => {
		const app = fakePhoneHost(), hub = new PhoneHub(app.host, () => 0), frames: DesktopFrame[] = [];
		const first = hub.open({ id: "dev", name: "Pixel" }, frame => frames.push(frame)), second = hub.open({ id: "dev", name: "Pixel" }, frame => frames.push(frame));
		for (let index = 0; index < 50; index++) await (index % 2 ? first : second).receive(JSON.stringify({ id: String(index), type: "list_chats" }));
		await first.receive(JSON.stringify({ id: "over", type: "list_chats" }));
		expect(frames.at(-1)).toMatchObject({ id: "over", ok: false, error: { code: "rate_limited" } });
		expect(new RequestRate(() => 0).take()).toBe(true);
	});
	it("tells every connected phone when a chat needs the person", () => {
		const { app, frames } = connected();
		const task = app.get("chat-1");
		task.approvals = [{ id: "ap1", method: "Run command", description: "pnpm test" }]; task.status = "waiting"; app.touch(task); app.changed();
		expect(frames).toContainEqual({ type: "attention", chatId: "chat-1", kind: "approval", summary: "Streaming: approval needed" });
	});
});

describe("phone chat shapes", () => {
	it("pages the list newest first with a cursor that survives changes", () => {
		const app = fakePhoneHost();
		for (const id of ["a", "b", "c"]) app.addTask({ id, title: id });
		const first = chatListPage(app.overview(), undefined, 2);
		expect(first.chats.map(chat => chat.id)).toEqual(["c", "b"]);
		expect(chatListPage(app.overview(), first.cursor, 2)).toEqual({ chats: [expect.objectContaining({ id: "a" })] });
	});
	it("places activities after the message that started their turn and trims long text", () => {
		const entries = readingOrder([{ id: "u1", role: "user", text: "Go", createdAt: "t" }, { id: "a1", role: "assistant", text: "x".repeat(30_000), createdAt: "t" }], [{ id: "u1:1", type: "tool", title: "Read file", text: "y".repeat(5_000) }, { id: "loose", type: "reasoning", title: "Thinking", text: "" }]);
		expect(entries.map(entry => entry.id)).toEqual(["u1", "u1:1", "a1", "loose"]);
		expect(entries[1]).toMatchObject({ kind: "activity", truncated: true });
		expect((entries[2] as Extract<PhoneEntry, { kind: "message" }>).text.length).toBe(20_001);
	});
	it("splits entries so no frame passes 1 MiB", () => {
		const big = Array.from({ length: 60 }, (_, index) => ({ kind: "message" as const, id: String(index), role: "assistant" as const, text: "z".repeat(20_000), createdAt: "t" }));
		const frames = entryFrames(big);
		expect(frames.length).toBe(2);
		expect(frames.every(frame => Buffer.byteLength(JSON.stringify(frame)) < 1024 * 1024)).toBe(true);
		expect(frames.flat()).toHaveLength(60);
	});
	it("raises attention only on a change, never for a chat seen for the first time", () => {
		const base = { id: "c", title: "Chat", archived: false, status: "running", approvalsCount: 0, answersCount: 0 } as Parameters<typeof attentionOf>[1];
		expect(attentionOf(undefined, { ...base, status: "completed" })).toBeUndefined();
		expect(attentionOf(base, { ...base, status: "completed" })).toEqual({ kind: "done", summary: "Chat: finished" });
		expect(attentionOf(base, { ...base, status: "failed" })?.kind).toBe("failed");
		expect(attentionOf(base, { ...base, answersCount: 1 })?.kind).toBe("question");
		expect(attentionOf({ ...base, status: "completed" }, { ...base, status: "completed" })).toBeUndefined();
	});
});
