import { describe, expect, it } from "vitest";
import { typingGuardState, typingIdleMs, updateTypingGuard } from "./composerTypingGuard";

const typing = (now: number) => updateTypingGuard(updateTypingGuard(typingGuardState(), { type: "focus" }), { type: "type", now });

describe("updateTypingGuard", () => {
	it("holds a request that arrives while the person is typing", () => {
		const state = updateTypingGuard(typing(1000), { type: "requests", ids: ["q1"], now: 1000 + typingIdleMs - 1 });
		expect([...state.held]).toEqual(["q1"]);
	});

	it("shows a request at once after a pause, or when the box is not focused", () => {
		expect(updateTypingGuard(typing(1000), { type: "requests", ids: ["q1"], now: 1000 + typingIdleMs }).held.size).toBe(0);
		expect(updateTypingGuard(updateTypingGuard(typingGuardState(), { type: "type", now: 1000 }), { type: "requests", ids: ["q1"], now: 1001 }).held.size).toBe(0);
	});

	it("never holds a request it has already shown", () => {
		const shown = updateTypingGuard(typingGuardState(), { type: "requests", ids: ["q1"], now: 0 });
		const typed = updateTypingGuard(updateTypingGuard(shown, { type: "focus" }), { type: "type", now: 10 });
		expect(updateTypingGuard(typed, { type: "requests", ids: ["q1"], now: 11 }).held.size).toBe(0);
	});

	it("releases held requests on idle, send and blur, and drops ones that went away", () => {
		const held = updateTypingGuard(typing(0), { type: "requests", ids: ["q1", "q2"], now: 1 });
		expect(held.held.size).toBe(2);
		for (const type of ["idle", "send", "blur"] as const) expect(updateTypingGuard(held, { type }).held.size).toBe(0);
		expect([...updateTypingGuard(held, { type: "requests", ids: ["q2"], now: 2 }).held]).toEqual(["q2"]);
	});

	it("keeps the same held set when nothing changed, so renders stay stable", () => {
		const held = updateTypingGuard(typing(0), { type: "requests", ids: ["q1"], now: 1 });
		expect(updateTypingGuard(held, { type: "requests", ids: ["q1"], now: 2 }).held).toBe(held.held);
	});
});
