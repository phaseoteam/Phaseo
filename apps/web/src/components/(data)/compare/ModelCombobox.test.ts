import { groupModelsByReleaseMonth } from "./ModelCombobox";
import type { CompareModelOption } from "./types";

const model = (id: string, name: string, releaseDate: string | null) =>
	({ id, name, release_date: releaseDate }) as CompareModelOption;

describe("groupModelsByReleaseMonth", () => {
	const models = [
		model("a/old", "Old", "2025-11-03"),
		model("a/beta", "beta", "2026-01-10"),
		model("a/undated", "Undated", null),
		model("a/alpha", "Alpha", "2026-01-10"),
		model("a/newest", "Newest", "2026-01-28"),
		model("a/bad-date", "Bad date", "not a date"),
	];

	it("orders months newest first with undated models last, and models newest first then by name", () => {
		const groups = groupModelsByReleaseMonth(models, (date) => `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`, "Unknown");
		expect(groups.map((group) => [group.monthKey, group.monthLabel])).toEqual([
			["2026-01", "2026-1"],
			["2025-11", "2025-11"],
			["unknown", "Unknown"],
		]);
		expect(groups[0].models.map((m) => m.id)).toEqual(["a/newest", "a/alpha", "a/beta"]);
		// Undated models tie on date, so they sort by name.
		expect(groups[2].models.map((m) => m.id)).toEqual(["a/bad-date", "a/undated"]);
	});

	it("labels each month once, not once per model", () => {
		const monthLabel = jest.fn((date: Date) => date.toISOString().slice(0, 7));
		groupModelsByReleaseMonth(models, monthLabel, "Unknown");
		expect(monthLabel).toHaveBeenCalledTimes(2);
	});
});
