import { barPosition, roadmapRange, todayPosition } from "./roadmap";
import type { RoadmapProject } from "./types";

const project = (overrides: Partial<RoadmapProject>): RoadmapProject => ({
	id: "p", name: "P", description: "", state: "active", leadUserId: null, targetDate: null, startDate: null, initiativeId: null,
	itemCount: 0, doneCount: 0, progress: 0, createdAt: "2026-10-15T09:00:00Z", updatedAt: "2026-10-15T09:00:00Z", health: null, ...overrides,
});

describe("roadmap layout", () => {
	const today = new Date("2026-11-02T12:00:00Z");

	it("covers whole months from the earliest start to the latest target, and today", () => {
		const range = roadmapRange([project({ startDate: "2026-10-20", targetDate: "2027-01-10" })], today);
		expect(range.months.map((month) => month.key)).toEqual(["2026-10", "2026-11", "2026-12", "2027-01"]);
		expect(new Date(range.start).toISOString()).toBe("2026-10-01T00:00:00.000Z");
		expect(new Date(range.end).toISOString()).toBe("2027-02-01T00:00:00.000Z");
	});

	it("places bars inside the range, at least 1% wide", () => {
		const range = roadmapRange([project({ startDate: "2026-11-01", targetDate: "2026-11-30" })], today);
		const bar = barPosition(project({ startDate: "2026-11-01", targetDate: "2026-11-30" }), range)!;
		expect(bar.left).toBe(0);
		// The range runs at least 30 days past today, so November and December: November is about half.
		expect(bar.width).toBeGreaterThan(45);
		expect(bar.width).toBeLessThan(55);
		expect(barPosition(project({ targetDate: null }), range)).toBeNull();
		const tiny = barPosition(project({ startDate: "2026-11-10", targetDate: "2026-11-10" }), range)!;
		expect(tiny.width).toBeGreaterThanOrEqual(1);
	});

	it("starts undated projects at their creation day, and puts today on the line", () => {
		const range = roadmapRange([project({ targetDate: "2026-12-31" })], today);
		expect(barPosition(project({ targetDate: "2026-12-31" }), range)!.left).toBeGreaterThan(0);
		const line = todayPosition(range, today);
		expect(line).toBeGreaterThan(0);
		expect(line).toBeLessThan(100);
	});
});
