import { describe, expect, it } from "vitest";
import { normalizeProviderId, normalizeProviderList } from "./providerAliases";

describe("normalizeProviderId", () => {
	it("normalizes ids using strict trim + lowercase", () => {
		expect(normalizeProviderId("  OPENAI  ")).toBe("openai");
		expect(normalizeProviderId("Google-AI-Studio")).toBe("google-ai-studio");
		expect(normalizeProviderId("x-AI")).toBe("x-ai");
		expect(normalizeProviderId("z-ai")).toBe("z-ai");
	});

	it("does not alias display/provider brand names", () => {
		expect(normalizeProviderId("Mercury")).toBe("mercury");
		expect(normalizeProviderId("Inception Labs")).toBe("inception labs");
		expect(normalizeProviderId("Venice AI")).toBe("venice ai");
	});
});

describe("normalizeProviderList", () => {
	it("normalizes arrays in order", () => {
		expect(
			normalizeProviderList(["OpenAI", "Anthropic", "Google-AI-Studio", "x-AI", "z-ai"]),
		).toEqual(["openai", "anthropic", "google-ai-studio", "x-ai", "z-ai"]);
	});
});
