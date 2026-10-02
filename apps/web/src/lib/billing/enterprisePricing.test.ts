import { enterpriseQuoteOptions, enterpriseTierForMembers, normalizeEnterpriseQuestionnaire } from "./enterprisePricing";

describe("enterprise pricing", () => {
	it("calculates one Enterprise subscription for the exact member count", () => {
		const quote = enterpriseQuoteOptions(normalizeEnterpriseQuestionnaire({
			memberCount: 100,
			expectedMonthlyTopUpUsd: 500,
			typicalTopUpUsd: 250,
			paymentPreference: "card",
			needsSso: true,
			needsScim: true,
			wantsSlackConnect: false,
		}));
		expect(quote.tier.key).toBe("members_100");
		expect(quote.recommendedVariant).toBe("core");
		expect(quote.options).toHaveLength(1);
		expect(quote.options[0]).toMatchObject({ monthlyUsd: 29, feePolicy: "standard_5_percent" });
	});

	it("keeps the same top-up policy regardless of funding preference", () => {
		const quote = enterpriseQuoteOptions(normalizeEnterpriseQuestionnaire({
			memberCount: 200,
			expectedMonthlyTopUpUsd: 8_000,
			typicalTopUpUsd: 2_000,
			paymentPreference: "bank_transfer",
		}));
		expect(quote.recommendedVariant).toBe("core");
		expect(quote.options[0]).toMatchObject({ monthlyUsd: 35, includedCardTopUpUsd: 0, feePolicy: "standard_5_percent" });
	});

	it("prices a 10,000 member team self-serve with marginal volume discounts", () => {
		const quote = enterpriseQuoteOptions(normalizeEnterpriseQuestionnaire({
			memberCount: 10_000,
			expectedMonthlyTopUpUsd: 145_000,
			typicalTopUpUsd: 25_000,
			paymentPreference: "bank_transfer",
		}));
		expect(quote.tier.label).toBe("Up to 10,000 workspace members");
		expect(quote.options[0]).toMatchObject({ monthlyUsd: 299, includedMembers: 10_000, includedCardTopUpUsd: 0 });
	});

	it("keeps a 100,000 member workspace within the self-serve curve", () => {
		const quote = enterpriseQuoteOptions(normalizeEnterpriseQuestionnaire({
			memberCount: 100_000,
			expectedMonthlyTopUpUsd: 0,
			typicalTopUpUsd: 0,
			paymentPreference: "card",
		}));
		expect(quote.options[0]).toMatchObject({ monthlyUsd: 1_999, includedMembers: 100_000 });
	});

	it("prices members above 100,000 as monthly unique-member overage", () => {
		const quote = enterpriseQuoteOptions(normalizeEnterpriseQuestionnaire({
			memberCount: 150_000,
			expectedMonthlyTopUpUsd: 0,
			typicalTopUpUsd: 0,
			paymentPreference: "card",
		}));
		expect(quote.options[0]).toMatchObject({ monthlyUsd: 1_999, includedMembers: 100_000, overageMembers: 50_000, overageMemberMonthlyUsd: 0.02, estimatedOverageMonthlyUsd: 1_000, estimatedMonthlyUsd: 2_999 });
	});

	it.each([
		[1_000, 79],
		[25_000, 599],
		[50_000, 1_099],
	])("uses the published anchor price for %i members", (memberCount, monthlyUsd) => {
		const quote = enterpriseQuoteOptions(normalizeEnterpriseQuestionnaire({
			memberCount,
			expectedMonthlyTopUpUsd: 0,
			typicalTopUpUsd: 0,
			paymentPreference: "card",
		}));
		expect(quote.options[0].monthlyUsd).toBe(monthlyUsd);
	});

	it.each([1, 5, 99, 100])("includes 100 members for a %i-member workspace", (memberCount) => {
		const quote = enterpriseQuoteOptions(normalizeEnterpriseQuestionnaire({
			memberCount, expectedMonthlyTopUpUsd: 0, typicalTopUpUsd: 0, paymentPreference: "card",
		}));
		expect(quote.tier).toMatchObject({ key: "members_100", maxMembers: 100, coreMonthlyUsd: 29 });
		expect(quote.options[0]).toMatchObject({ includedMembers: 100, monthlyUsd: 29, overageMembers: 0, estimatedMonthlyUsd: 29 });
	});

	it.each([0, -1, 1.5, 2_147_483_648])("rejects invalid member counts: %s", (memberCount) => {
		expect(() => enterpriseTierForMembers(memberCount)).toThrow("member_count_out_of_range");
	});

	it("interpolates smoothly between the reduced entry anchors and unchanged larger tiers", () => {
		expect(enterpriseTierForMembers(550).coreMonthlyUsd).toBe(54);
		expect(enterpriseTierForMembers(5_500).coreMonthlyUsd).toBe(189);
	});
});
