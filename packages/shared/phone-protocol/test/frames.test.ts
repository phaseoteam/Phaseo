import { describe, expect, it } from "vitest";
import { effortLabel, parseDesktopFrame, parsePhoneFrame, phoneLimits, PhoneProtocolError, RequestRate } from "../src/index";

const refused = (text: string) => { try { parsePhoneFrame(text); } catch (error) { return error as PhoneProtocolError; } throw new Error("accepted"); };

describe("phone frames", () => {
	it("accepts each request with its fields and drops unknown ones", () => {
		expect(parsePhoneFrame(JSON.stringify({ id: "1", type: "send", chatId: "c", text: "hi", steer: true, extra: 1 }))).toEqual({ id: "1", type: "send", chatId: "c", text: "hi", steer: true });
		expect(parsePhoneFrame(JSON.stringify({ id: "2", type: "list_chats", limit: 50 }))).toEqual({ id: "2", type: "list_chats", limit: 50 });
		expect(parsePhoneFrame(JSON.stringify({ id: "3", type: "subscribe", chatIds: ["a", "a", "b"] }))).toEqual({ id: "3", type: "subscribe", chatIds: ["a", "b"] });
		expect(parsePhoneFrame(JSON.stringify({ id: "4", type: "answer_question", chatId: "c", questionId: "q", answers: { one: ["Yes"] } }))).toMatchObject({ answers: { one: ["Yes"] } });
		expect(parsePhoneFrame(JSON.stringify({ type: "ping" }))).toEqual({ type: "ping" });
	});
	it("refuses what the phone may not ask for, keeping the id for the error", () => {
		expect(refused(JSON.stringify({ id: "1", type: "answer_approval", chatId: "c", approvalId: "a", decision: "always" }))).toMatchObject({ code: "invalid_frame", id: "1", type: "answer_approval" });
		expect(refused(JSON.stringify({ id: "1", type: "list_chats", limit: 51 })).message).toContain("limit");
		expect(refused(JSON.stringify({ id: "1", type: "read_chat" })).message).toContain("chatId");
		expect(refused(JSON.stringify({ id: "1", type: "send", chatId: "c", text: "   " })).message).toContain("text");
		expect(refused(JSON.stringify({ id: "1", type: "new_chat", text: "x", mode: "admin" })).message).toContain("mode");
		expect(refused(JSON.stringify({ id: "1", type: "update_settings" })).message).toBe("Unknown frame type.");
		expect(refused(JSON.stringify({ type: "stop", chatId: "c" })).message).toContain("id");
		expect(refused("not json").code).toBe("invalid_frame");
		expect(refused("[1]").code).toBe("invalid_frame");
	});
	it("lets a new chat name its model and effort, and lists the models to pick from", () => {
		expect(parsePhoneFrame(JSON.stringify({ id: "1", type: "new_chat", text: "Fix it", mode: "code", projectId: "p1", model: "gpt-6.1", reasoningEffort: "high" })))
			.toEqual({ id: "1", type: "new_chat", text: "Fix it", mode: "code", projectId: "p1", model: "gpt-6.1", reasoningEffort: "high" });
		// Without them the computer chooses, as before.
		expect(parsePhoneFrame(JSON.stringify({ id: "2", type: "new_chat", text: "Fix it", mode: "chat" }))).toEqual({ id: "2", type: "new_chat", text: "Fix it", mode: "chat" });
		expect(parsePhoneFrame(JSON.stringify({ id: "3", type: "list_models", projectId: "p1", extra: true }))).toEqual({ id: "3", type: "list_models", projectId: "p1" });
		expect(parsePhoneFrame(JSON.stringify({ id: "4", type: "list_models" }))).toEqual({ id: "4", type: "list_models" });
	});
	it("lets a new chat name the agent its model belongs to, and asks for a mode's models", () => {
		expect(parsePhoneFrame(JSON.stringify({ id: "1", type: "new_chat", text: "Fix it", mode: "plan", model: "gpt-6.1", harness: "codex", accountId: "acc" })))
			.toEqual({ id: "1", type: "new_chat", text: "Fix it", mode: "plan", model: "gpt-6.1", harness: "codex", accountId: "acc" });
		expect(refused(JSON.stringify({ id: "2", type: "new_chat", text: "x", mode: "code", harness: "codex" })).message).toContain("model");
		expect(refused(JSON.stringify({ id: "3", type: "new_chat", text: "x", mode: "code", model: "m", accountId: "acc" })).message).toContain("harness");
		expect(refused(JSON.stringify({ id: "4", type: "new_chat", text: "x", mode: "code", model: "m", harness: "h".repeat(41) })).message).toContain("harness");
		expect(parsePhoneFrame(JSON.stringify({ id: "5", type: "list_models", mode: "code" }))).toEqual({ id: "5", type: "list_models", mode: "code" });
		expect(refused(JSON.stringify({ id: "6", type: "list_models", mode: "admin" })).message).toContain("mode");
	});
	it("refuses a model, effort or project that isn't an id", () => {
		expect(refused(JSON.stringify({ id: "1", type: "new_chat", text: "x", mode: "code", model: "" })).message).toContain("model");
		expect(refused(JSON.stringify({ id: "1", type: "new_chat", text: "x", mode: "code", reasoningEffort: 3 })).message).toContain("reasoningEffort");
		expect(refused(JSON.stringify({ id: "1", type: "new_chat", text: "x", mode: "code", reasoningEffort: "h".repeat(101) })).message).toContain("reasoningEffort");
		expect(refused(JSON.stringify({ id: "1", type: "list_models", projectId: "a\u0001" }))).toMatchObject({ code: "invalid_frame", id: "1", type: "list_models" });
	});
	it("lists projects, and lets hello carry the phone's protocol", () => {
		expect(parsePhoneFrame(JSON.stringify({ id: "1", type: "list_projects", extra: 1 }))).toEqual({ id: "1", type: "list_projects" });
		expect(parsePhoneFrame(JSON.stringify({ id: "2", type: "hello", deviceId: "d", appVersion: "1", protocol: 2 }))).toEqual({ id: "2", type: "hello", deviceId: "d", appVersion: "1", protocol: 2 });
		// A phone from before protocol 2 sends none.
		expect(parsePhoneFrame(JSON.stringify({ id: "3", type: "hello", deviceId: "d", appVersion: "1" }))).toEqual({ id: "3", type: "hello", deviceId: "d", appVersion: "1" });
		expect(refused(JSON.stringify({ id: "4", type: "hello", deviceId: "d", appVersion: "1", protocol: "2" })).message).toContain("protocol");
		expect(parseDesktopFrame(JSON.stringify({ type: "projects_changed", projects: [{ id: "p1", name: "Phaseo", repository: true }] }))).toMatchObject({ type: "projects_changed" });
		expect(() => parseDesktopFrame(JSON.stringify({ type: "projects_changed" }))).toThrow(PhoneProtocolError);
	});
	it("organises chats, changes their settings and edits their queue (protocol 3)", () => {
		expect(parsePhoneFrame(JSON.stringify({ id: "1", type: "update_chat", chatId: "c", action: "settle" }))).toEqual({ id: "1", type: "update_chat", chatId: "c", action: "settle" });
		expect(parsePhoneFrame(JSON.stringify({ id: "2", type: "update_chat", chatId: "c", action: "rename", title: "  New name " }))).toMatchObject({ title: "New name" });
		expect(parsePhoneFrame(JSON.stringify({ id: "3", type: "update_chat", chatId: "c", action: "snooze", until: "2026-11-03T09:00:00.000Z" }))).toMatchObject({ until: "2026-11-03T09:00:00.000Z" });
		expect(refused(JSON.stringify({ id: "4", type: "update_chat", chatId: "c", action: "delete" })).message).toContain("action");
		expect(refused(JSON.stringify({ id: "5", type: "update_chat", chatId: "c", action: "rename" })).message).toContain("title");
		expect(refused(JSON.stringify({ id: "6", type: "update_chat", chatId: "c", action: "settle", title: "x" })).message).toContain("title");
		expect(refused(JSON.stringify({ id: "7", type: "update_chat", chatId: "c", action: "snooze", until: "soon" })).message).toContain("until");
		expect(parsePhoneFrame(JSON.stringify({ id: "8", type: "set_chat", chatId: "c", model: "gpt-6.1", reasoningEffort: "high" }))).toEqual({ id: "8", type: "set_chat", chatId: "c", model: "gpt-6.1", reasoningEffort: "high" });
		expect(refused(JSON.stringify({ id: "9", type: "set_chat", chatId: "c" })).message).toContain("set_chat needs");
		expect(parsePhoneFrame(JSON.stringify({ id: "11", type: "set_chat", chatId: "c", defaultEffort: true }))).toEqual({ id: "11", type: "set_chat", chatId: "c", defaultEffort: true });
		expect(refused(JSON.stringify({ id: "12", type: "set_chat", chatId: "c", defaultEffort: true, reasoningEffort: "high" })).message).toContain("not both");
		expect(refused(JSON.stringify({ id: "10", type: "set_chat", chatId: "c", permissionMode: "full-access" })).message).toContain("set_chat needs");
		expect(parsePhoneFrame(JSON.stringify({ id: "11", type: "queue", chatId: "c", messageId: "q1", action: "edit", text: "Shorter" }))).toMatchObject({ action: "edit", text: "Shorter" });
		expect(refused(JSON.stringify({ id: "12", type: "queue", chatId: "c", messageId: "q1", action: "edit" })).message).toContain("text");
		expect(refused(JSON.stringify({ id: "13", type: "queue", chatId: "c", messageId: "q1", action: "remove", text: "x" })).message).toContain("Only edit");
		expect(parsePhoneFrame(JSON.stringify({ id: "14", type: "list_chats", archived: true }))).toEqual({ id: "14", type: "list_chats", archived: true });
	});
	it("names efforts the same way on both sides", () => {
		expect(effortLabel("xhigh")).toBe("Extra high");
		expect(effortLabel("medium")).toBe("Medium");
		expect(effortLabel("turbo")).toBe("Turbo");
	});
	it("refuses frames over 1 MiB", () => {
		expect(refused(JSON.stringify({ id: "1", type: "send", chatId: "c", text: "x".repeat(phoneLimits.frameBytes) })).code).toBe("too_large");
	});
	it("checks the shape of the desktop's frames for the phone", () => {
		expect(parseDesktopFrame(JSON.stringify({ id: "1", type: "stop", ok: true, result: { chatId: "c" } }))).toMatchObject({ ok: true });
		expect(parseDesktopFrame(JSON.stringify({ type: "attention", chatId: "c", kind: "done", summary: "Finished" }))).toMatchObject({ kind: "done" });
		expect(() => parseDesktopFrame(JSON.stringify({ type: "attention", chatId: "c", kind: "other", summary: "" }))).toThrow(PhoneProtocolError);
		expect(() => parseDesktopFrame(JSON.stringify({ id: "1", ok: false }))).toThrow(PhoneProtocolError);
	});
});

describe("request rate", () => {
	it("allows a burst of 50 a second, then refuses until time passes", () => {
		let now = 0; const rate = new RequestRate(() => now);
		expect(Array.from({ length: 50 }, () => rate.take()).every(Boolean)).toBe(true);
		expect(rate.take()).toBe(false);
		now += 100;
		expect(Array.from({ length: 5 }, () => rate.take()).every(Boolean)).toBe(true);
		expect(rate.take()).toBe(false);
	});
});
