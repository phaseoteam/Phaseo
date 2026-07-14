import {
    formatProviderOfferDisplayName,
    resolveProviderDisplayName,
    resolveProviderLogoId,
} from "@/lib/providers/providerOffers";

describe("providerOffers", () => {
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

    test("normalizes Anthropic on AWS provider names", () => {
        expect(
            resolveProviderDisplayName({
                providerId: "anthropic-aws",
                providerName: "Anthropic",
            }),
        ).toBe("Anthropic on AWS");
        expect(
            formatProviderOfferDisplayName({
                providerId: "anthropic-aws-us",
                providerName: "Anthropic",
                offerLabel: "AWS US",
                offerScope: "regional",
            }),
        ).toBe("Anthropic on AWS (US)");
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
});
