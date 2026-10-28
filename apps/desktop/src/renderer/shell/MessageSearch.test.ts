import { describe, expect, it } from "vitest";
import { snippetParts } from "./MessageSearch";

describe("message search snippets", () => {
	it("marks every occurrence of the query, ignoring case", () => {
		expect(snippetParts("…the Lisbon trip and lisbon trams", "LISBON")).toEqual([
			{ text: "…the ", match: false }, { text: "Lisbon", match: true }, { text: " trip and ", match: false }, { text: "lisbon", match: true }, { text: " trams", match: false },
		]);
		expect(snippetParts("plain", " ")).toEqual([{ text: "plain", match: false }]);
	});
});
