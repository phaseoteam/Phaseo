import { toUsdPerMillion } from "./helpers";

describe("toUsdPerMillion", () => {
	test("normalizes prices when unit_size is 1,000,000", () => {
		expect(toUsdPerMillion(0.5, 1_000_000)).toBe(0.5);
		expect(toUsdPerMillion(1.75, 1_000_000)).toBe(1.75);
	});

	test("scales per-token prices to per-1M correctly", () => {
		expect(toUsdPerMillion(0.0000025, 1)).toBe(2.5);
	});

	test("returns 0 for invalid inputs", () => {
		expect(toUsdPerMillion(undefined, 1_000_000)).toBe(0);
		expect(toUsdPerMillion(1, 0)).toBe(0);
		expect(toUsdPerMillion("abc", 1_000_000)).toBe(0);
	});
});
