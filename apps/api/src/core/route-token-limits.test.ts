import { describe, expect, it } from "vitest";
import { routeOutputTokenLimit } from "./route-token-limits";

describe("routeOutputTokenLimit", () => {
	it("keeps positive limits", () => {
		expect(routeOutputTokenLimit(8192)).toBe(8192);
		expect(routeOutputTokenLimit("4096")).toBe(4096);
	});

	it.each([null, undefined, "", 0, -1, "0", Number.NaN, Number.POSITIVE_INFINITY, "abc"])("treats %s as unknown", (value) => {
		expect(routeOutputTokenLimit(value)).toBeNull();
	});
});
