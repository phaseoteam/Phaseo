import { describe, expect, it } from "vitest";
import { normalizeProviderId, normalizeProviderList } from "./providerAliases";

describe("normalizeProviderId", () => {
	it("normalizes display names and aliases to canonical ids", () => {
		expect(normalizeProviderId("Google AI Studio")).toBe("google-ai-studio");
		expect(normalizeProviderId("Google Vertex")).toBe("google-vertex");
		expect(normalizeProviderId("xAI")).toBe("x-ai");
		expect(normalizeProviderId("z.AI")).toBe("z-ai");
		expect(normalizeProviderId("AionLabs")).toBe("aion-labs");
		expect(normalizeProviderId("AtlasCloud")).toBe("atlascloud");
		expect(normalizeProviderId("MiniMax Lightning")).toBe("minimax-lightning");
		expect(normalizeProviderId("Moonshot AI Turbo")).toBe("moonshot-ai-turbo");
		expect(normalizeProviderId("Weights & Biases")).toBe("weights-and-biases");
	});

	it("falls back to slugified id for unknown providers", () => {
		expect(normalizeProviderId("My New Provider")).toBe("my-new-provider");
	});
});

describe("normalizeProviderList", () => {
	it("normalizes arrays in order", () => {
		expect(
			normalizeProviderList(["OpenAI", "Anthropic", "Google AI Studio", "xAI", "z.AI"]),
		).toEqual(["openai", "anthropic", "google-ai-studio", "x-ai", "z-ai"]);
	});
});
