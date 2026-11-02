import { batchRows, guessMapping, mapRows, parseCsv } from "./csv";

describe("CSV import helpers", () => {
	it("parses quotes, doubled quotes, line breaks in quotes and CRLF", () => {
		const text = '﻿Title,Description,Status\r\n"Login, fails","Says ""no""\nthen crashes",In Progress\r\nSecond,,Done\n\n';
		expect(parseCsv(text)).toEqual([
			["Title", "Description", "Status"],
			["Login, fails", 'Says "no"\nthen crashes', "In Progress"],
			["Second", "", "Done"],
		]);
	});

	it("guesses columns from common export headers", () => {
		expect(guessMapping(["Issue key", "Summary", "Status", "Priority", "Labels", "Story Points", "Description"])).toEqual({ title: 1, description: 6, state: 2, priority: 3, labels: 4, estimate: 5, externalId: 0 });
		expect(guessMapping(["ID", "Title", "Workflow State", "Estimate"])).toMatchObject({ title: 1, state: 2, estimate: 3, externalId: 0 });
	});

	it("maps rows and skips those without a title", () => {
		expect(mapRows([["A", "Done"], ["", "Todo"], ["B", ""]], { title: 0, state: 1 })).toEqual([{ title: "A", state: "Done" }, { title: "B", state: "" }]);
		expect(mapRows([["A"]], {})).toEqual([]);
	});

	it("batches by count and size", () => {
		expect(batchRows([1, 2, 3, 4, 5], 2).map((batch) => batch.length)).toEqual([2, 2, 1]);
		expect(batchRows(["x".repeat(60), "y".repeat(60)], 100, 100).length).toBe(2);
	});
});
