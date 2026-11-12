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

	it("starts from an earlier receipt time so admission is measured", () => {
		vi.useFakeTimers();
		try {
			vi.setSystemTime(new Date("2026-07-22T17:00:00.250Z"));
			const receivedAt = Date.parse("2026-07-22T17:00:00.100Z");
			const timer = new Timer(undefined, receivedAt);

			expect(timer.startedAtMs()).toBe(receivedAt);
			expect(timer.between("admission", "request_start")).toBeCloseTo(150, 0);
			expect(new Timer(undefined, Date.parse("2026-07-22T17:00:01Z")).startedAtMs())
				.toBe(Date.parse("2026-07-22T17:00:00.250Z"));
		} finally {
			vi.useRealTimers();
		}
	});
});
