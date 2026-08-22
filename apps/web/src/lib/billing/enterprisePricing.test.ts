import { enterpriseQuoteOptions, normalizeEnterpriseQuestionnaire } from "./enterprisePricing";

describe("enterprise pricing", () => {
	it("selects the seat band and recommends Core for lighter card usage", () => {
		const quote = enterpriseQuoteOptions(normalizeEnterpriseQuestionnaire({
			memberCount: 60,
			expectedMonthlyTopUpUsd: 500,
			typicalTopUpUsd: 250,
			paymentPreference: "card",
			needsSso: true,
			needsScim: true,
			wantsSlackConnect: false,
		}));
		expect(quote.tier.key).toBe("up_to_100");
		expect(quote.recommendedVariant).toBe("core");
		expect(quote.options.map((option) => option.monthlyUsd)).toEqual([299, 499]);
	});

	it("recommends Included Payments for bank transfers and exposes its allowance", () => {
		const quote = enterpriseQuoteOptions(normalizeEnterpriseQuestionnaire({
			memberCount: 200,
			expectedMonthlyTopUpUsd: 8_000,
			typicalTopUpUsd: 2_000,
			paymentPreference: "bank_transfer",
		}));
		expect(quote.recommendedVariant).toBe("included_payments");
		expect(quote.options[1]).toMatchObject({ monthlyUsd: 899, includedCardTopUpUsd: 10_000 });
	});
});
