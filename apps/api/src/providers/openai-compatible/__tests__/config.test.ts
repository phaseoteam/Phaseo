import { describe, it, expect } from "vitest";
import { resolveOpenAICompatRoute } from "../config";

describe("resolveOpenAICompatRoute", () => {
	it("routes openai chat-only models to chat", () => {
		expect(resolveOpenAICompatRoute("openai", "openai/gpt-audio")).toBe("chat");
		expect(resolveOpenAICompatRoute("openai", "gpt-audio-mini")).toBe("chat");
	});

	it("routes openai legacy models to legacy completions", () => {
		expect(resolveOpenAICompatRoute("openai", "openai/babbage-002")).toBe("legacy_completions");
		expect(resolveOpenAICompatRoute("openai", "davinci-002")).toBe("legacy_completions");
	});
});
