import { startOfUTCWeek } from "./time-buckets";

it.each([
	["2026-10-05T00:00:00Z", "2026-10-05T00:00:00.000Z"],
	["2026-10-05T00:30:00+01:00", "2026-09-28T00:00:00.000Z"],
	["2026-10-25T23:30:00Z", "2026-10-19T00:00:00.000Z"],
	["2026-03-29T23:30:00+01:00", "2026-03-23T00:00:00.000Z"],
])("aligns %s with the UTC database week", (input, expected) => {
	expect(startOfUTCWeek(new Date(input)).toISOString()).toBe(expected);
});

it("does not insert phantom buckets alongside successive database weeks", () => {
	const buckets = new Set([Date.parse("2026-09-28T00:00:00Z"), Date.parse("2026-10-05T00:00:00Z")]);
	const end = startOfUTCWeek(new Date("2026-10-05T12:00:00+01:00")).getTime();
	for (let i = 51; i >= 0; i--) buckets.add(end - i * 7 * 24 * 60 * 60 * 1000);
	expect(buckets.size).toBe(52);
	expect([...buckets].filter((ts) => ts >= Date.parse("2026-09-28T00:00:00Z"))).toHaveLength(2);
});
