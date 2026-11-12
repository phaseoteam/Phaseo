import { describe, expect, it } from "vitest";
import { activeMenuKey, stepMenuKey } from "./composerMenuHighlight";

describe("activeMenuKey", () => {
	it("starts on the first row", () => {
		expect(activeMenuKey({ keys: ["a", "b"], query: "x" })).toBe("a");
		expect(activeMenuKey({ keys: [], highlighted: "a", query: "x", highlightedQuery: "x" })).toBeUndefined();
	});

	it("keeps the highlighted row while results refresh for the same query", () => {
		expect(activeMenuKey({ keys: ["new", "a", "b"], highlighted: "b", query: "x", highlightedQuery: "x" })).toBe("b");
	});

	it("goes back to the first row when the query changes or the row is gone", () => {
		expect(activeMenuKey({ keys: ["a", "b"], highlighted: "b", query: "xy", highlightedQuery: "x" })).toBe("a");
		expect(activeMenuKey({ keys: ["a", "c"], highlighted: "b", query: "x", highlightedQuery: "x" })).toBe("a");
	});
});

describe("stepMenuKey", () => {
	it("moves and wraps", () => {
		expect(stepMenuKey(["a", "b", "c"], "a", 1)).toBe("b");
		expect(stepMenuKey(["a", "b", "c"], "c", 1)).toBe("a");
		expect(stepMenuKey(["a", "b", "c"], "a", -1)).toBe("c");
		expect(stepMenuKey(["a", "b"], undefined, 1)).toBe("a");
		expect(stepMenuKey([], "a", 1)).toBeUndefined();
	});
});
