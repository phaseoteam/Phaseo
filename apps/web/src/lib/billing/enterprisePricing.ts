export const ENTERPRISE_PRICING_VERSION = "2026-08-21";

export type EnterprisePlanVariant = "core" | "included_payments";
export type EnterprisePaymentPreference = "card" | "ach" | "bank_transfer";

export type EnterpriseQuestionnaire = {
	memberCount: number;
	expectedMonthlyTopUpUsd: number;
	typicalTopUpUsd: number;
	paymentPreference: EnterprisePaymentPreference;
	needsSso: boolean;
	needsScim: boolean;
	wantsSlackConnect: boolean;
};

export type EnterpriseTier = {
	key: "up_to_25" | "up_to_100" | "up_to_250" | "up_to_500";
	label: string;
	maxMembers: number;
	coreMonthlyUsd: number;
	includedPaymentsMonthlyUsd: number;
	includedCardTopUpUsd: number;
};

export type EnterpriseQuoteOption = {
	variant: EnterprisePlanVariant;
	planKey: string;
	monthlyUsd: number;
	includedMembers: number;
	includedCardTopUpUsd: number;
	feePolicy: "standard_5_percent" | "included_allowance";
};

export const ENTERPRISE_TIERS: readonly EnterpriseTier[] = [
	{ key: "up_to_25", label: "Up to 25 members", maxMembers: 25, coreMonthlyUsd: 99, includedPaymentsMonthlyUsd: 149, includedCardTopUpUsd: 1_000 },
	{ key: "up_to_100", label: "Up to 100 members", maxMembers: 100, coreMonthlyUsd: 299, includedPaymentsMonthlyUsd: 499, includedCardTopUpUsd: 5_000 },
	{ key: "up_to_250", label: "Up to 250 members", maxMembers: 250, coreMonthlyUsd: 599, includedPaymentsMonthlyUsd: 899, includedCardTopUpUsd: 10_000 },
	{ key: "up_to_500", label: "Up to 500 members", maxMembers: 500, coreMonthlyUsd: 999, includedPaymentsMonthlyUsd: 1_499, includedCardTopUpUsd: 15_000 },
] as const;

export function normalizeEnterpriseQuestionnaire(input: Partial<EnterpriseQuestionnaire>): EnterpriseQuestionnaire {
	const memberCount = Math.round(Number(input.memberCount));
	const expectedMonthlyTopUpUsd = Math.round(Number(input.expectedMonthlyTopUpUsd));
	const typicalTopUpUsd = Math.round(Number(input.typicalTopUpUsd));
	const paymentPreference = input.paymentPreference;
	if (!Number.isFinite(memberCount) || memberCount < 1 || memberCount > 500) throw new Error("member_count_out_of_range");
	if (!Number.isFinite(expectedMonthlyTopUpUsd) || expectedMonthlyTopUpUsd < 0 || expectedMonthlyTopUpUsd > 10_000_000) throw new Error("monthly_top_up_out_of_range");
	if (!Number.isFinite(typicalTopUpUsd) || typicalTopUpUsd < 0 || typicalTopUpUsd > 10_000_000) throw new Error("typical_top_up_out_of_range");
	if (paymentPreference !== "card" && paymentPreference !== "ach" && paymentPreference !== "bank_transfer") throw new Error("invalid_payment_preference");
	return {
		memberCount,
		expectedMonthlyTopUpUsd,
		typicalTopUpUsd,
		paymentPreference,
		needsSso: Boolean(input.needsSso),
		needsScim: Boolean(input.needsScim),
		wantsSlackConnect: Boolean(input.wantsSlackConnect),
	};
}

export function enterpriseTierForMembers(memberCount: number): EnterpriseTier {
	const tier = ENTERPRISE_TIERS.find((candidate) => memberCount <= candidate.maxMembers);
	if (!tier) throw new Error("member_count_out_of_range");
	return tier;
}

export function enterpriseQuoteOptions(questionnaire: EnterpriseQuestionnaire): {
	tier: EnterpriseTier;
	recommendedVariant: EnterprisePlanVariant;
	options: EnterpriseQuoteOption[];
} {
	const tier = enterpriseTierForMembers(questionnaire.memberCount);
	const recommendedVariant: EnterprisePlanVariant =
		questionnaire.paymentPreference === "bank_transfer" || questionnaire.expectedMonthlyTopUpUsd >= tier.includedCardTopUpUsd * 0.35
			? "included_payments"
			: "core";
	return {
		tier,
		recommendedVariant,
		options: [
			{
				variant: "core",
				planKey: `enterprise_core_${tier.key}`,
				monthlyUsd: tier.coreMonthlyUsd,
				includedMembers: tier.maxMembers,
				includedCardTopUpUsd: 0,
				feePolicy: "standard_5_percent",
			},
			{
				variant: "included_payments",
				planKey: `enterprise_included_payments_${tier.key}`,
				monthlyUsd: tier.includedPaymentsMonthlyUsd,
				includedMembers: tier.maxMembers,
				includedCardTopUpUsd: tier.includedCardTopUpUsd,
				feePolicy: "included_allowance",
			},
		],
	};
}

const PRICE_ENV_BY_PLAN_KEY: Record<string, string> = {
	enterprise_core_up_to_25: "STRIPE_ENTERPRISE_CORE_25_PRICE_ID",
	enterprise_included_payments_up_to_25: "STRIPE_ENTERPRISE_INCLUDED_25_PRICE_ID",
	enterprise_core_up_to_100: "STRIPE_ENTERPRISE_CORE_100_PRICE_ID",
	enterprise_included_payments_up_to_100: "STRIPE_ENTERPRISE_INCLUDED_100_PRICE_ID",
	enterprise_core_up_to_250: "STRIPE_ENTERPRISE_CORE_250_PRICE_ID",
	enterprise_included_payments_up_to_250: "STRIPE_ENTERPRISE_INCLUDED_250_PRICE_ID",
	enterprise_core_up_to_500: "STRIPE_ENTERPRISE_CORE_500_PRICE_ID",
	enterprise_included_payments_up_to_500: "STRIPE_ENTERPRISE_INCLUDED_500_PRICE_ID",
};

export function stripePriceIdForEnterprisePlan(planKey: string): string | null {
	const envKey = PRICE_ENV_BY_PLAN_KEY[planKey];
	return envKey ? process.env[envKey]?.trim() || null : null;
}
