import { describe, expect, it } from "vitest";
import { supportsProviderStreamCancellation } from "./stream-cancellation";

describe("supportsProviderStreamCancellation", () => {
	it("returns true for explicitly supported providers", () => {
		expect(supportsProviderStreamCancellation("openai")).toBe(true);
		expect(supportsProviderStreamCancellation("anthropic")).toBe(true);
		expect(supportsProviderStreamCancellation("x-ai")).toBe(true);
		expect(supportsProviderStreamCancellation("xai")).toBe(true);
		expect(supportsProviderStreamCancellation("novitaai")).toBe(true);
	});

	it("returns false for explicitly unsupported providers", () => {
		expect(supportsProviderStreamCancellation("amazon-bedrock")).toBe(false);
		expect(supportsProviderStreamCancellation("groq")).toBe(false);
		expect(supportsProviderStreamCancellation("google-ai-studio")).toBe(false);
		expect(supportsProviderStreamCancellation("nebius-token-factory")).toBe(false);
	});

	it("defaults unknown providers to false", () => {
		expect(supportsProviderStreamCancellation("unknown-provider")).toBe(false);
		expect(supportsProviderStreamCancellation("")).toBe(false);
	});
});

