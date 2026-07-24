import { describe, expect, it, vi } from "vitest";

import { Timer } from "./timer";

describe("Timer request epoch", () => {
	it("captures the epoch clock when the request timer is constructed", () => {
		vi.useFakeTimers();
		try {
			vi.setSystemTime(new Date("2026-07-22T17:00:00.123Z"));
			const timer = new Timer();

			expect(timer.startedAtMs()).toBe(Date.parse("2026-07-22T17:00:00.123Z"));
		} finally {
			vi.useRealTimers();
		}
	});
});
