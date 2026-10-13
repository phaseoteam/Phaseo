import { describe, expect, it } from "vitest";
import { calculateMaxTries, getBaseModel, stripPrioritySuffix, googleFlexMinimumHeadersTimeoutMs } from "./utils";

describe("Google Flex queue deadline", () => {
	it.each(["google-ai-studio", "google-vertex", "google-vertex-eu"])("extends the deadline for %s Flex", (provider) => {
		expect(googleFlexMinimumHeadersTimeoutMs(provider, {}, { service_tier: "flex" })).toBe(600_000);
		expect(googleFlexMinimumHeadersTimeoutMs(provider, {}, { serviceTier: " FLEX " })).toBe(600_000);
		expect(googleFlexMinimumHeadersTimeoutMs(provider, { service_tier: { provider_catalog: { name: "flex", upstream: "flex" } } }, {})).toBe(600_000);
		expect(googleFlexMinimumHeadersTimeoutMs(provider, {}, { service_tier: "priority" })).toBeUndefined();
	});
	it("respects the selected catalogue tier and leaves other providers unchanged", () => {
		expect(googleFlexMinimumHeadersTimeoutMs("google-vertex-eu", { service_tier: { provider_catalog: { name: "standard" } } }, { service_tier: "flex" })).toBeUndefined();
		expect(googleFlexMinimumHeadersTimeoutMs("openai", {}, { service_tier: "flex" })).toBeUndefined();
	});
});

describe("priority suffix helpers", () => {
	it("strips fast/nitro/cheap suffixes", () => {
		expect(stripPrioritySuffix("openai/gpt-5.2-codex:fast")).toBe("openai/gpt-5.2-codex");
		expect(stripPrioritySuffix("openai/gpt-5.2-codex:nitro")).toBe("openai/gpt-5.2-codex");
		expect(stripPrioritySuffix("openai/gpt-5.2-codex:cheap")).toBe("openai/gpt-5.2-codex");
	});

	it("strips suffixes case-insensitively", () => {
		expect(stripPrioritySuffix("openai/gpt-5.2-codex:NITRO")).toBe("openai/gpt-5.2-codex");
	});

	it("leaves model unchanged when no priority suffix is present", () => {
		expect(stripPrioritySuffix("openai/gpt-5.2-codex")).toBe("openai/gpt-5.2-codex");
		expect(getBaseModel("openai/gpt-5.2-codex")).toBe("openai/gpt-5.2-codex");
	});

	it("leaves removed aliases unchanged", () => {
		expect(stripPrioritySuffix("openai/gpt-5.2-codex:quick")).toBe("openai/gpt-5.2-codex:quick");
		expect(stripPrioritySuffix("openai/gpt-5.2-codex:floor")).toBe("openai/gpt-5.2-codex:floor");
	});

	it("allows failover attempts across the full ranked provider list", () => {
		expect(calculateMaxTries(0)).toBe(0);
		expect(calculateMaxTries(3)).toBe(3);
		expect(calculateMaxTries(5)).toBe(5);
		expect(calculateMaxTries(8)).toBe(8);
	});

	it("limits attempts to one provider when fallbacks are disabled", () => {
		expect(calculateMaxTries(0, false)).toBe(0);
		expect(calculateMaxTries(3, false)).toBe(1);
	});
});
