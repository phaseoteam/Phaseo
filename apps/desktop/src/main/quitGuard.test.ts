import { describe, expect, it, vi } from "vitest";
import { QuitGuard, workingChats } from "./quitGuard";
import { defaultChatPreferences, validateChatPreferences } from "../shared/chatPreferences";

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe("asking before quitting", () => {
	it("counts chats an agent is working in, not archived ones", () => {
		expect(workingChats([{ status: "running" }, { status: "waiting" }, { status: "idle" }, { status: "running", archived: true }])).toBe(2);
	});
	it("quits straight away when nothing is working, unless it always asks", () => {
		const ask = vi.fn(async () => true), quit = vi.fn();
		expect(new QuitGuard({ mode: () => "working", working: () => 0, ask, quit }).intercept()).toBe(false);
		expect(new QuitGuard({ mode: () => "direct", working: () => 3, ask, quit }).intercept()).toBe(false);
		expect(new QuitGuard({ mode: () => "always", working: () => 0, ask, quit }).intercept()).toBe(true);
	});
	it("asks once, quits on yes without asking again, and stays open on no", async () => {
		let answer = false;
		const ask = vi.fn(async () => answer), quit = vi.fn();
		const guard = new QuitGuard({ mode: () => "working", working: () => 2, ask, quit });
		expect(guard.intercept()).toBe(true);
		expect(guard.intercept()).toBe(true);
		await flush();
		expect(ask).toHaveBeenCalledTimes(1); expect(ask).toHaveBeenCalledWith(2); expect(quit).not.toHaveBeenCalled();
		answer = true;
		expect(guard.intercept()).toBe(true);
		await flush();
		expect(quit).toHaveBeenCalledOnce();
		expect(guard.intercept()).toBe(false);
	});
});

describe("chat preferences", () => {
	it("fills in what older saved preferences lack and rejects invalid values", () => {
		expect(validateChatPreferences(undefined)).toEqual(defaultChatPreferences);
		expect(validateChatPreferences({ followUp: "steer" })).toEqual({ ...defaultChatPreferences, followUp: "steer" });
		expect(() => validateChatPreferences({ quitConfirmation: "sometimes" })).toThrow("Choose when quitting asks first.");
		expect(() => validateChatPreferences({ diffIgnoreWhitespace: "yes" })).toThrow();
		expect(() => validateChatPreferences([])).toThrow();
	});
});
