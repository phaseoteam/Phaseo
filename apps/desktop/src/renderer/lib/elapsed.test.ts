import { describe, expect, it } from "vitest";
import { elapsedLabel } from "./elapsed";

describe("elapsed labels", () => {
	it("counts seconds, then minutes and seconds, then hours and minutes", () => {
		expect(elapsedLabel(-5)).toBe("0s");
		expect(elapsedLabel(12_400)).toBe("12s");
		expect(elapsedLabel(245_000)).toBe("4m 05s");
		expect(elapsedLabel(3_720_000)).toBe("1h 02m");
	});
});
