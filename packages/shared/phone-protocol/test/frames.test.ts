import { describe, expect, it } from "vitest";
import { parseDesktopFrame, parsePhoneFrame, phoneLimits, PhoneProtocolError, RequestRate } from "../src/index";

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
