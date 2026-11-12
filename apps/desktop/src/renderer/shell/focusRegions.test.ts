import { describe, expect, it } from "vitest";
import { adjacentRegion } from "./focusRegions";

describe("adjacentRegion", () => {
	it("steps through the regions and wraps at either end", () => {
		expect(adjacentRegion(4, 1, 1)).toBe(2);
		expect(adjacentRegion(4, 3, 1)).toBe(0);
		expect(adjacentRegion(4, 0, -1)).toBe(3);
	});
	it("starts at the first or last region from outside them, and finds none in an empty window", () => {
		expect(adjacentRegion(3, -1, 1)).toBe(0);
		expect(adjacentRegion(3, -1, -1)).toBe(2);
		expect(adjacentRegion(0, -1, 1)).toBe(-1);
	});
});
