import {
    formatProviderOfferDisplayName,
    formatProviderOfferVariantLabel,
    resolveProviderDisplayName,
    resolveProviderLogoId,
} from "@/lib/providers/providerOffers";

describe("providerOffers", () => {
    test("preserves specialized catalogue names while formatting explicit regions", () => {
        expect(resolveProviderDisplayName({ providerId: "minimax-lightning", providerName: "MiniMax Lightning", offerLabel: "highspeed", offerScope: "specialized" })).toBe("MiniMax Lightning");
        expect(resolveProviderDisplayName({ providerId: "regional-route", providerName: "Example", offerLabel: "Singapore", offerScope: "regional" })).toBe("Example (Singapore)");
    });
    test.each([
        ["openai", "OpenAI", "OpenAI"],
        ["openai-eu", "OpenAI", "OpenAI (EU)"],
        ["anthropic-us", "Anthropic", "Anthropic (US)"],
        ["anthropic-aws-us", "Anthropic", "Claude Platform for AWS (US)"],
        ["google-vertex-eu", "Google Vertex (EU)", "Google Vertex (EU)"],
        ["google-vertex-eu", "Google Vertex EU", "Google Vertex (EU)"],
    ])("preserves route identity for %s", (providerId, providerName, expected) => {
        const name = resolveProviderDisplayName({ providerId, providerName });
        expect(name).toBe(expected);
        expect(formatProviderOfferDisplayName({ providerId, providerName: name })).toBe(expected);
    });

    test("does not repeat specialized offer labels when formatting catalogue names again", () => {
        expect(formatProviderOfferDisplayName({ providerId: "example-fast", providerName: "Example Fast", offerLabel: "Fast", offerScope: "specialized" })).toBe("Example Fast");
    });

    test("retains the region when offer scope is omitted", () => {
        expect(formatProviderOfferDisplayName({ providerId: "openai-eu", providerName: "OpenAI", offerLabel: "EU" })).toBe("OpenAI (EU)");
    });

    test("keeps Anthropic on AWS offers branded with AWS logos", () => {
        expect(
            resolveProviderLogoId({
                providerId: "anthropic-aws",
                providerFamilyId: "anthropic",
            }),
        ).toBe("aws");
        expect(
            resolveProviderLogoId({
                providerId: "anthropic-aws-us",
                providerFamilyId: "anthropic",
            }),
        ).toBe("aws");
    });

    test("resolves regional and specialized provider logos through their catalog IDs", () => {
        expect(
            resolveProviderLogoId({
                providerId: "nebius-token-factory-fast",
                providerFamilyId: "nebius-token-factory",
            }),
        ).toBe("nebius-token-factory");
        expect(
            resolveProviderLogoId({
                providerId: "openai-eu",
                providerFamilyId: "openai",
            }),
        ).toBe("openai");
    });

    test("uses the Claude Platform for AWS product name", () => {
        expect(
            resolveProviderDisplayName({
                providerId: "anthropic-aws",
                providerName: "Anthropic",
            }),
        ).toBe("Claude Platform for AWS");
        expect(
            formatProviderOfferDisplayName({
                providerId: "anthropic-aws-us",
                providerName: "Anthropic",
                offerLabel: "AWS US",
                offerScope: "regional",
            }),
        ).toBe("Claude Platform for AWS (US)");
    });

    test("formats regional offers with bracketed regions", () => {
        expect(
            formatProviderOfferDisplayName({
                providerId: "anthropic-us",
                providerName: "Anthropic",
                offerLabel: "US",
                offerScope: "regional",
            }),
        ).toBe("Anthropic (US)");
        expect(
            formatProviderOfferDisplayName({
                providerId: "openai-eu",
                providerName: "OpenAI",
                offerLabel: "EU",
                offerScope: "regional",
            }),
        ).toBe("OpenAI (EU)");
    });

    test("keeps regional offers distinct when an older pricing projection omits offer metadata", () => {
        expect(
            formatProviderOfferDisplayName({
                providerId: "anthropic-us",
                providerName: "Anthropic",
            }),
        ).toBe("Anthropic (US)");
        expect(
            formatProviderOfferDisplayName({
                providerId: "anthropic-aws-us",
                providerName: "Anthropic",
            }),
		).toBe("Claude Platform for AWS (US)");
        expect(
            formatProviderOfferDisplayName({
                providerId: "google-vertex-eu",
                providerName: "Google Vertex",
            }),
        ).toBe("Google Vertex (EU)");
    });

    test("labels fast provider variants as Fast", () => {
        expect(
            formatProviderOfferVariantLabel({ providerId: "minimax-lightning" }),
        ).toBe("Fast");
        expect(
            formatProviderOfferVariantLabel({ offerLabel: "priority" }),
        ).toBe("Fast");
    });
});
