import { describe, expect, it } from "vitest";
import { normalizeTags, tagHue, tagsInUse } from "./tags";

describe("chat tags", () => {
	it("trims, drops empties and case-insensitive repeats, keeping the first spelling", () => {
		expect(normalizeTags(["  Research ", "#pricing", "", "research", "Pricing", "Release   notes"])).toEqual(["Research", "pricing", "Release notes"]);
	});

	it("rejects long, non-text and too many tags", () => {
		expect(() => normalizeTags(["x".repeat(25)])).toThrow("24 characters");
		expect(() => normalizeTags([1])).toThrow("text");
		expect(() => normalizeTags("Research")).toThrow("list");
		expect(() => normalizeTags(Array.from({ length: 9 }, (_, index) => `tag ${index}`))).toThrow("up to 8");
		expect(() => normalizeTags(["a\u0007b"])).toThrow();
	});

	it("lists tags in use by count, ignoring archived chats", () => {
		expect(tagsInUse([{ tags: ["Pricing", "Research"] }, { tags: ["research"] }, { tags: ["Travel"], archived: true }])).toEqual(["Research", "Pricing"]);
	});

	it("gives a tag the same hue whatever its case", () => {
		expect(tagHue("Research")).toBe(tagHue("research"));
		expect(tagHue("Research")).toBeGreaterThanOrEqual(0);
		expect(tagHue("Research")).toBeLessThan(360);
	});
});
