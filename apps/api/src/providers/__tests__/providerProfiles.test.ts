import { describe, expect, it } from "vitest";
import { getProviderProfile } from "../providerProfiles";

describe("providerProfiles", () => {
	it("resolves alias entries to the canonical profile", () => {
		const openai = getProviderProfile("openai");
		const azure = getProviderProfile("azure");
		expect(openai?.id).toBe("openai");
		expect(azure?.id).toBe("openai");
	});

	it("contains text-only policy for known providers", () => {
		expect(getProviderProfile("ai21")?.textOnly).toBe(true);
		expect(getProviderProfile("xiaomi")?.textOnly).toBe(true);
		expect(getProviderProfile("arcee-ai")?.textOnly).toBe(true);
		expect(getProviderProfile("arcee")?.textOnly).toBe(true);
		expect(getProviderProfile("friendli")?.textOnly).toBe(true);
		expect(getProviderProfile("google-vertex")?.textOnly).toBe(true);
	});

	it("stores text normalize hints in one place", () => {
		const anthropic = getProviderProfile("anthropic");
		expect(anthropic?.text?.normalize?.maxTemperature).toBe(1);
		expect(anthropic?.text?.normalize?.defaultMaxTokensWhenMissing).toBe(4096);
	});
});
