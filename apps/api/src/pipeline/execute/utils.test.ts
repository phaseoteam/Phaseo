import { describe, expect, it } from "vitest";
import { calculateMaxTries, getBaseModel, stripPrioritySuffix } from "./utils";

describe("priority suffix helpers", () => {
	it("strips fast/quick/nitro suffixes", () => {
		expect(stripPrioritySuffix("openai/gpt-5.2-codex:fast")).toBe("openai/gpt-5.2-codex");
		expect(stripPrioritySuffix("openai/gpt-5.2-codex:quick")).toBe("openai/gpt-5.2-codex");
		expect(stripPrioritySuffix("openai/gpt-5.2-codex:nitro")).toBe("openai/gpt-5.2-codex");
	});

	it("strips suffixes case-insensitively", () => {
		expect(stripPrioritySuffix("openai/gpt-5.2-codex:NITRO")).toBe("openai/gpt-5.2-codex");
	});

	it("leaves model unchanged when no priority suffix is present", () => {
		expect(stripPrioritySuffix("openai/gpt-5.2-codex")).toBe("openai/gpt-5.2-codex");
		expect(getBaseModel("openai/gpt-5.2-codex")).toBe("openai/gpt-5.2-codex");
	});

	it("caps failover attempts at five candidates", () => {
		expect(calculateMaxTries(0)).toBe(0);
		expect(calculateMaxTries(3)).toBe(3);
		expect(calculateMaxTries(5)).toBe(5);
		expect(calculateMaxTries(8)).toBe(5);
	});
});
