import { describe, expect, it } from "vitest";
import { mentionAt } from "./mentions";

describe("mentionAt", () => {
	it("finds the name being typed after @, at the start or after a space or bracket", () => {
		expect(mentionAt("@", 1)).toEqual({ start: 0, query: "" });
		expect(mentionAt("thanks @dan", 11)).toEqual({ start: 7, query: "dan" });
		expect(mentionAt("(cc @octo-cat", 13)).toEqual({ start: 4, query: "octo-cat" });
		// Only up to the caret: the rest of the line doesn't matter.
		expect(mentionAt("hi @da and more", 6)).toEqual({ start: 3, query: "da" });
	});

	it("ignores emails, code, a finished name and a double @", () => {
		expect(mentionAt("mail dan@example", 16)).toBeNull();
		expect(mentionAt("run `@types", 11)).toBeNull();
		expect(mentionAt("@dan done", 9)).toBeNull();
		expect(mentionAt("@@dan", 5)).toBeNull();
	});
});
