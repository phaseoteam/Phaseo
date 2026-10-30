import {
	describeDetailedRelativeCalendarDate,
	describeRelativeCalendarDate,
	formatModelLifecycleDate,
} from "./modelLifecycleDates";

describe("formatModelLifecycleDate", () => {
	test("renders model dates using the canonical UTC calendar day", () => {
		expect(formatModelLifecycleDate("2026-06-08")).toBe("08 Jun 2026");
	});

	test("returns a placeholder for missing or invalid dates", () => {
		expect(formatModelLifecycleDate()).toBe("-");
		expect(formatModelLifecycleDate("not-a-date")).toBe("-");
	});
});

describe("describeRelativeCalendarDate", () => {
	const now = new Date("2026-06-08T23:30:00-07:00");

	test("treats date-only fields as UTC calendar dates", () => {
		expect(describeRelativeCalendarDate("2026-06-09", now)).toEqual({
			label: "Today",
			tone: "today",
			dayDifference: 0,
		});
	});

	test("formats past lifecycle milestones", () => {
		expect(describeRelativeCalendarDate("2026-03-08", now)).toEqual({
			label: "3 months ago",
			tone: "past",
			dayDifference: -93,
		});
	});

	test("formats upcoming lifecycle milestones", () => {
		expect(describeRelativeCalendarDate("2026-07-10", now)).toEqual({
			label: "In 1 month",
			tone: "future",
			dayDifference: 31,
		});
	});

	test("handles adjacent days explicitly", () => {
		expect(describeRelativeCalendarDate("2026-06-10", now)).toEqual({
			label: "Tomorrow",
			tone: "future",
			dayDifference: 1,
		});
		expect(describeRelativeCalendarDate("2026-06-08", new Date("2026-06-09T09:00:00Z"))).toEqual({
			label: "Yesterday",
			tone: "past",
			dayDifference: -1,
		});
	});
});

describe("describeDetailedRelativeCalendarDate", () => {
	test("breaks past dates into calendar years, months, and days", () => {
		expect(
			describeDetailedRelativeCalendarDate(
				"2023-08-22",
				new Date("2026-06-08T09:00:00Z"),
			),
		).toMatchObject({
			detailedLabel: "2 years, 9 months, 17 days ago",
			totalDays: 1021,
		});
	});

	test("breaks future dates into calendar months and days", () => {
		expect(
			describeDetailedRelativeCalendarDate(
				"2026-09-28",
				new Date("2026-06-08T09:00:00Z"),
			),
		).toMatchObject({
			detailedLabel: "In 3 months, 20 days",
			totalDays: 112,
		});
	});
});
