import { describe, it, expect } from "vitest";
import {
	contentToValue,
	filterSuggestions,
	findTrigger,
	normalizeValue,
	sameValue,
	tokenInputText,
	valueToContent,
	type TokenInputValue,
} from "@phaseo/ui/token-input-model";

const terra = { type: "model", value: "openai/gpt-6.1-terra", label: "GPT-6.1 Terra" };
const fable = { type: "model", value: "anthropic/claude-fable-5.2", label: "Claude Fable 5.2" };

describe("findTrigger", () => {
	it("finds a trigger at the start or after whitespace", () => {
		expect(findTrigger("@ge", ["@"])).toEqual({ char: "@", query: "ge", offset: 0 });
		expect(findTrigger("compare @gem", ["@", "/"])).toEqual({ char: "@", query: "gem", offset: 8 });
		expect(findTrigger("use /eu", ["@", "/"])).toEqual({ char: "/", query: "eu", offset: 4 });
		expect(findTrigger("compare @", ["@"])).toEqual({ char: "@", query: "", offset: 8 });
	});

	it("ignores triggers inside words and closed queries", () => {
		expect(findTrigger("me@example.com", ["@"])).toBeNull();
		expect(findTrigger("@gem and more", ["@"])).toBeNull();
		expect(findTrigger("no trigger", ["@"])).toBeNull();
		expect(findTrigger("￼@gem", ["@"])).toBeNull();
	});
});

describe("filterSuggestions", () => {
	const items = [
		{ value: "google/gemini-4-hydrogen", label: "Gemini 4 Hydrogen", keywords: ["google"] },
		{ value: "openai/gpt-6.1-terra", label: "GPT-6.1 Terra", keywords: ["openai"] },
		{ value: "moonshot/kimi-k3.1-pro", label: "Kimi K3.1 Pro" },
	];

	it("ranks label prefixes, then word starts, then any match", () => {
		expect(filterSuggestions(items, "g").map((item) => item.label)).toEqual(["Gemini 4 Hydrogen", "GPT-6.1 Terra"]);
		expect(filterSuggestions(items, "terra").map((item) => item.label)).toEqual(["GPT-6.1 Terra"]);
		expect(filterSuggestions(items, "openai").map((item) => item.label)).toEqual(["GPT-6.1 Terra"]);
		expect(filterSuggestions(items, "zzz")).toEqual([]);
	});

	it("returns the first items for an empty query and respects the limit", () => {
		expect(filterSuggestions(items, "", 2)).toHaveLength(2);
	});
});

describe("value and editor content", () => {
	it("round-trips text, tokens and line breaks", () => {
		const value: TokenInputValue = ["Compare ", terra, " and ", fable, "\non price"];
		expect(contentToValue(valueToContent(value))).toEqual(value);
	});

	it("treats separate paragraphs as new lines and merges adjacent text", () => {
		const doc = {
			type: "doc",
			content: [
				{ type: "paragraph", content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] },
				{ type: "paragraph", content: [{ type: "token", attrs: terra }] },
			],
		};
		expect(contentToValue(doc)).toEqual(["ab\n", terra]);
	});

	it("writes tokens as their labels in plain text", () => {
		expect(tokenInputText(["Ask ", terra, "."])).toBe("Ask GPT-6.1 Terra.");
	});
});

describe("sameValue", () => {
	it("compares tokens by their fields, not their property order", () => {
		const reordered = { label: terra.label, value: terra.value, type: terra.type };
		expect(sameValue(["Ask ", terra], ["Ask ", reordered])).toBe(true);
		expect(sameValue(["Ask ", terra], ["Ask ", fable])).toBe(false);
		expect(sameValue(["Ask"], ["Ask", ""])).toBe(false);
		expect(sameValue([terra], ["GPT-6.1 Terra"])).toBe(false);
	});

	it("matches the editor's form once normalized", () => {
		expect(normalizeValue(["a", "b", "", terra])).toEqual(["ab", terra]);
	});
});
