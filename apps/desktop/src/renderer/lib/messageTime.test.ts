import { describe, expect, it } from "vitest";
import { fullMessageTime, messageTime } from "./messageTime";

// Local times, so the days are the reader's days whatever zone the test runs in.
const at = (year: number, month: number, day: number, hour = 14, minute = 5) => new Date(year, month - 1, day, hour, minute).toISOString();
const now = new Date(2026, 9, 31, 9, 0).getTime();

describe("message timestamps", () => {
	it("say the day once a message is not from today", () => {
		expect(messageTime(at(2026, 10, 31, 8, 30), now)).toBe("08:30");
		expect(messageTime(at(2026, 10, 30, 23, 59), now)).toBe("Yesterday 23:59");
		expect(messageTime(at(2026, 10, 29), now)).toBe("29 Oct, 14:05");
		expect(messageTime(at(2025, 12, 31), now)).toBe("31 Dec 2025, 14:05");
		expect(messageTime("not a date", now)).toBe("");
	});
	it("give the whole moment for a tooltip", () => {
		expect(fullMessageTime(at(2026, 10, 30, 14, 5))).toMatch(/^Friday,? 30 October 2026( at|,) 14:05:00$/);
	});
});
