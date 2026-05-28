import {
    formatProviderOfferDisplayName,
    resolveProviderDisplayName,
    resolveProviderLogoId,
} from "@/lib/providers/providerOffers";

describe("providerOffers", () => {
    test("keeps Anthropic on AWS offers branded with Amazon logos", () => {
        expect(
            resolveProviderLogoId({
                providerId: "anthropic-aws",
                providerFamilyId: "anthropic",
            }),
        ).toBe("amazon");
        expect(
            resolveProviderLogoId({
                providerId: "anthropic-aws-us",
                providerFamilyId: "anthropic",
            }),
        ).toBe("amazon");
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
        ).toBe("Anthropic on AWS US");
    });
});
