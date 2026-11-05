import { describe, expect, it } from "vitest";
import { contextTokens, idleCompactionDue } from "./idleCompaction";
import type { Task } from "./workspace";

const now = Date.parse("2026-11-02T12:00:00Z"), minute = 60_000;
const chat = (idleMs: number, extra: Partial<Task> = {}) => ({
	harness: "claude", status: "completed", archived: false, nativeSessionId: "session", queue: [],
	messages: [{ id: "u", role: "user", text: "Refactor the parser", createdAt: "", completedAt: new Date(now - idleMs).toISOString() }, { id: "a", role: "assistant", text: "x".repeat(500_000), createdAt: "" }],
	activities: [], ...extra,
}) as Pick<Task, "harness" | "status" | "archived" | "nativeSessionId" | "queue" | "snoozedUntil" | "settledOverride" | "messages" | "activities">;

describe("idle compaction", () => {
	it("compacts before the cache expires only in the minute before it lapses", () => {
		expect(idleCompactionDue(chat(4.5 * minute), "beforeCacheExpires", "timer", now)).toBe(true);
		expect(idleCompactionDue(chat(3 * minute), "beforeCacheExpires", "timer", now)).toBe(false);
		expect(idleCompactionDue(chat(6 * minute), "beforeCacheExpires", "timer", now)).toBe(false);
		// Each mode has its own moment, and off never compacts.
		expect(idleCompactionDue(chat(4.5 * minute), "onReturn", "timer", now)).toBe(false);
		expect(idleCompactionDue(chat(4.5 * minute), "off", "timer", now)).toBe(false);
	});

	it("compacts when you return once the cache has lapsed", () => {
		expect(idleCompactionDue(chat(10 * minute), "onReturn", "return", now)).toBe(true);
		expect(idleCompactionDue(chat(2 * minute), "onReturn", "return", now)).toBe(false);
		expect(idleCompactionDue(chat(10 * minute), "beforeCacheExpires", "return", now)).toBe(false);
	});

	it("leaves small, busy, parked or unsupported chats alone, and never compacts twice in a row", () => {
		const small = chat(4.5 * minute, { messages: [{ id: "u", role: "user", text: "Hi", createdAt: "", completedAt: new Date(now - 4.5 * minute).toISOString() }] });
		expect(idleCompactionDue(small, "beforeCacheExpires", "timer", now)).toBe(false);
		for (const extra of [{ status: "running" }, { harness: "cursor" }, { nativeSessionId: undefined }, { archived: true }, { queue: [{ id: "q", text: "next", createdAt: "" }] }, { settledOverride: "settled" }, { snoozedUntil: new Date(now + 3_600_000).toISOString() }] as Partial<Task>[])
			expect(idleCompactionDue(chat(4.5 * minute, extra), "beforeCacheExpires", "timer", now)).toBe(false);
		const compacted = chat(4.5 * minute); compacted.messages[0] = { ...compacted.messages[0], text: "/compact" };
		expect(idleCompactionDue(compacted, "beforeCacheExpires", "timer", now)).toBe(false);
	});

	it("reads the context from the last usage report when there is one", () => {
		const usage = (id: string, text: object) => ({ id, type: "usage" as const, title: "Usage", text: JSON.stringify(text) });
		expect(contextTokens({ messages: [], activities: [usage("u:usage:1", { prompt_tokens: 150_000, prompt_tokens_details: { cached_tokens: 140_000 } }), usage("autopilot:1:usage", { prompt_tokens: 10 })] })).toBe(150_000);
		expect(contextTokens({ messages: [{ id: "m", role: "assistant", text: "x".repeat(4000), createdAt: "" }], activities: [] })).toBe(1000);
	});
});
