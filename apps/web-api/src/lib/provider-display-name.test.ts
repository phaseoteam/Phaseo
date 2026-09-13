import { describe, expect, it } from "vitest";
import { formatProviderOfferDisplayName } from "./provider-display-name";

describe("formatProviderOfferDisplayName", () => {
	it("adds the regional offer to a shared provider name", () => {
		expect(formatProviderOfferDisplayName({
			providerId: "openai-eu",
			providerName: "OpenAI",
			offerLabel: "EU",
			offerScope: "regional",
		})).toBe("OpenAI (EU)");
	});

	it("removes a punctuated provider name from a regional offer label", () => {
		expect(formatProviderOfferDisplayName({
			providerId: "acme-eu",
			providerName: "Acme, Inc.",
			offerLabel: "Acme, Inc. EU",
			offerScope: "regional",
		})).toBe("Acme, Inc. (EU)");
	});

	it("does not alter a global provider name", () => {
		expect(formatProviderOfferDisplayName({
			providerId: "openai",
			providerName: "OpenAI",
			offerScope: "global",
		})).toBe("OpenAI");
	});

	it("uses the established display name for known specialized offers", () => {
		expect(formatProviderOfferDisplayName({
			providerId: "anthropic-aws",
			providerName: "Anthropic",
			offerLabel: "AWS",
			offerScope: "specialized",
		})).toBe("Claude Platform for AWS");
	});

	it("appends unknown specialized offer labels", () => {
		expect(formatProviderOfferDisplayName({
			providerId: "example-fast",
			providerName: "Example",
			offerLabel: "Fast",
			offerScope: "specialized",
		})).toBe("Example Fast");
	});

	it("does not repeat a specialized label already in parentheses", () => {
		expect(formatProviderOfferDisplayName({
			providerId: "wafer-zdr",
			providerName: "Wafer (ZDR)",
			offerLabel: "ZDR",
			offerScope: "specialized",
		})).toBe("Wafer (ZDR)");
	});

	it("does not repeat regional labels in spaced or hyphenated names", () => {
		expect(formatProviderOfferDisplayName({
			providerId: "example-eu",
			providerName: "Example EU",
			offerLabel: "EU",
			offerScope: "regional",
		})).toBe("Example EU");
		expect(formatProviderOfferDisplayName({
			providerId: "example-eu",
			providerName: "Example-EU",
			offerLabel: "EU",
			offerScope: "regional",
		})).toBe("Example-EU");
	});
});
