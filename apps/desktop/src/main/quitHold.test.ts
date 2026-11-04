import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuitHold, type QuitHoldInput } from "./quitHold";
import { QuitGuard } from "./quitGuard";
import { defaultChatPreferences } from "../shared/chatPreferences";

const key = (type: "keyDown" | "keyUp", key: string, extra: Partial<QuitHoldInput> = {}): QuitHoldInput => ({ type, key, control: false, meta: false, alt: false, shift: false, isAutoRepeat: false, ...extra });
const ctrlQ = (extra: Partial<QuitHoldInput> = {}) => key("keyDown", "q", { control: true, ...extra });

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("holding the quit shortcut", () => {
	it("is the default", () => {
		expect(defaultChatPreferences.quitConfirmation).toBe("hold");
	});
	it("quits once Ctrl+Q is held for a second, whatever key repeats arrive", () => {
		const quit = vi.fn(), states: string[] = [];
		const hold = new QuitHold({ mac: false, enabled: () => true, quit });
		expect(hold.input(ctrlQ(), state => states.push(state.state))).toBe(true);
		vi.advanceTimersByTime(500);
		expect(hold.input(ctrlQ({ isAutoRepeat: true }), state => states.push(state.state))).toBe(true);
		vi.advanceTimersByTime(499);
		expect(quit).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(quit).toHaveBeenCalledOnce();
		expect(states).toEqual(["holding", "quitting"]);
	});
	it("cancels when Q or the modifier is let go first, or the window loses focus", () => {
		const quit = vi.fn(), states: string[] = [];
		const hold = new QuitHold({ mac: false, enabled: () => true, quit });
		const notify = (state: { state: string }) => states.push(state.state);
		hold.input(ctrlQ(), notify); hold.input(key("keyUp", "q"), notify);
		hold.input(ctrlQ(), notify); hold.input(key("keyUp", "Control"), notify);
		hold.input(ctrlQ(), notify); hold.cancel();
		vi.advanceTimersByTime(5000);
		expect(quit).not.toHaveBeenCalled();
		expect(states).toEqual(["holding", "cancelled", "holding", "cancelled", "holding", "cancelled"]);
	});
	it("uses ⌘Q on macOS, and leaves other keys and other modes alone", () => {
		const quit = vi.fn(), notify = vi.fn();
		const mac = new QuitHold({ mac: true, enabled: () => true, quit });
		expect(mac.input(ctrlQ(), notify)).toBe(false);
		expect(mac.input(key("keyDown", "q", { meta: true, shift: true }), notify)).toBe(false);
		expect(mac.input(key("keyDown", "w", { meta: true }), notify)).toBe(false);
		expect(mac.input(key("keyDown", "Q", { meta: true }), notify)).toBe(true);
		const off = new QuitHold({ mac: false, enabled: () => false, quit });
		expect(off.input(ctrlQ(), notify)).toBe(false);
	});
	it("other ways of quitting ask only while chats are working, and a finished hold never asks", () => {
		const ask = vi.fn(async () => true), quit = vi.fn();
		expect(new QuitGuard({ mode: () => "hold", working: () => 0, ask, quit }).intercept()).toBe(false);
		expect(new QuitGuard({ mode: () => "hold", working: () => 2, ask, quit }).intercept()).toBe(true);
		const guard = new QuitGuard({ mode: () => "hold", working: () => 2, ask, quit });
		guard.quitNow();
		expect(quit).toHaveBeenCalledOnce();
		expect(guard.intercept()).toBe(false);
		expect(ask).toHaveBeenCalledOnce();
	});
});
