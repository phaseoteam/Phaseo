import { formatRoundedCount } from "./formatRoundedCount";

describe("formatRoundedCount", () => {
	it.each([
		[0, "0"],
		[999, "999"],
		[999_999, "999K"],
		[49_910_627, "49M"],
		[25_000_000, "25M"],
		[1_999_999_999, "1B"],
		[1e12, "1T"],
		[1e15, "1Qa"],
		[1e18, "1Qi"],
	])("formats %s as %s without rounding up", (value, expected) => {
		expect(formatRoundedCount(value)).toBe(expected);
	});
});
