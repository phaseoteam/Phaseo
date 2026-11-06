import { describe, expect, it } from "vitest";
import { spellModelName } from "./modelNames";

describe("a model's name, whichever list it came from", () => {
	it("reads GPT 6.1 Sol", () => {
		expect(["GPT-6.1-Sol", "GPT-6.1 Sol", "GPT 6.1 Sol"].map(spellModelName)).toEqual(["GPT 6.1 Sol", "GPT 6.1 Sol", "GPT 6.1 Sol"]);
	});
	it("leaves other names alone", () => {
		expect(["GPT-4o-mini", "Claude Opus 5.5", "Qwen3-235B-A22B", "o4-mini"].map(spellModelName)).toEqual(["GPT-4o-mini", "Claude Opus 5.5", "Qwen3-235B-A22B", "o4-mini"]);
	});
});
